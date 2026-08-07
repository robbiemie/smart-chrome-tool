const HEADER_PROFILES_STORAGE_KEY = 'ajaxToolsHeaderProfiles';
const LEGACY_PAGE_HEADERS_STORAGE_KEY = 'ajaxToolsPageHeadersMap';
const MANAGED_RULE_IDS_STORAGE_KEY = 'ajaxToolsManagedHeaderRuleIds';
const WORKBENCH_TARGET_TAB_ID_STORAGE_KEY = 'ajaxToolsWorkbenchTargetTabId';
const CONTENT_SCRIPT_BOOTSTRAP_DELAY = 120;
const RULE_ID_BASE = 930000;

// Dev-mode logger: production releases (manifest name without "Beta") get
// all logs silenced; beta / dev builds log normally. Detection is runtime
// via chrome.runtime.getManifest() so the same source file works for both
// profiles without a build-time flag.
const isDevMode = (() => {
  try {
    return /beta/i.test(chrome.runtime.getManifest().name || '');
  } catch {
    return false;
  }
})();
const logDev = (...args) => { if (isDevMode) console.log(...args); };
const warnDev = (...args) => { if (isDevMode) console.warn(...args); };
// Web Store submission builds flip this to true at package time (build.js
// rewrites the literal before zipping the store variant) so the self-update
// codepath is fully inert at runtime: no update alarm, no GitHub fetch, and
// update/reload/token messages return a disabled response. GitHub-distributed
// builds keep it false so self-update stays available. The footer UI is
// hidden in parallel via the MOCKKIT_STORE_BUILD Vite flag.
const IS_STORE_BUILD = false;
// Tracks the page tab that last sent CHECK_UPDATE so RELOAD_EXTENSION can
// refresh only that tab after a self-update.
let lastWorkbenchTabId = null;
const RULE_ID_RANGE = 70000;
const SUPPORTED_RESOURCE_TYPES = ['main_frame', 'sub_frame', 'xmlhttprequest'];
const FORBIDDEN_REQUEST_HEADERS = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'permissions-policy',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
]);

function sendMessageToContentScript(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          message: chrome.runtime.lastError.message,
        });
        return;
      }

      resolve(response);
    });
  });
}

async function toggleIframeVisibility() {
  const { iframeVisible } = await chrome.storage.local.get({ iframeVisible: true });
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) {
    return;
  }

  const response = await ensurePanelMessageReceiver(tabs[0].id);

  if (!response?.ok) {
    return;
  }

  const toggleResponse = await sendMessageToContentScript(tabs[0].id, { type: 'iframeToggle', iframeVisible });

  // Keep the previous state when the current page cannot host the panel.
  if (typeof toggleResponse?.nextIframeVisible === 'boolean') {
    await chrome.storage.local.set({ iframeVisible: toggleResponse.nextIframeVisible });
  }
}

async function sendMessageToActiveTab(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab?.id) {
    return { ok: false, message: 'No active tab found.' };
  }

  const response = await sendMessageToContentScript(activeTab.id, message);
  return response || { ok: false, message: 'Active tab did not respond.' };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function getStoredTargetTab() {
  const storage = await chrome.storage.local.get({ [WORKBENCH_TARGET_TAB_ID_STORAGE_KEY]: null });
  const targetTabId = storage[WORKBENCH_TARGET_TAB_ID_STORAGE_KEY];

  if (typeof targetTabId !== 'number') {
    return null;
  }

  try {
    return await chrome.tabs.get(targetTabId);
  } catch (error) {
    await chrome.storage.local.remove(WORKBENCH_TARGET_TAB_ID_STORAGE_KEY);
    return null;
  }
}

async function getWorkbenchTargetTab() {
  const storedTargetTab = await getStoredTargetTab();

  if (storedTargetTab?.id && storedTargetTab.url) {
    return storedTargetTab;
  }

  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const fallbackTab = activeTabs.find((tab) => typeof tab.id === 'number' && Boolean(tab.url)) || null;

  if (fallbackTab?.id) {
    await chrome.storage.local.set({
      [WORKBENCH_TARGET_TAB_ID_STORAGE_KEY]: fallbackTab.id,
    });
  }

  return fallbackTab;
}

async function delay(duration) {
  await new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

async function ensurePanelMessageReceiver(tabId) {
  const pingResponse = await sendMessageToContentScript(tabId, { type: 'PING_AJAX_TOOLS_PANEL' });

  if (pingResponse?.ok) {
    return pingResponse;
  }

  if (!chrome.scripting?.executeScript) {
    return { ok: false, message: 'Scripting API is unavailable.' };
  }

  try {
    // Re-inject the content runtime on demand so the fixed panel can open even if the page missed the initial load hook.
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content.js'],
    });
    await delay(CONTENT_SCRIPT_BOOTSTRAP_DELAY);
    return await sendMessageToContentScript(tabId, { type: 'PING_AJAX_TOOLS_PANEL' });
  } catch (error) {
    return {
      ok: false,
      message: error?.message || 'Failed to inject the panel runtime.',
    };
  }
}

function buildRenderModeUrl(currentUrl, csrEnabled) {
  const parsedUrl = parseUrl(currentUrl);

  if (!parsedUrl) {
    return null;
  }

  if (csrEnabled) {
    parsedUrl.searchParams.set('__csr', '1');
  } else {
    parsedUrl.searchParams.delete('__csr');
  }

  return parsedUrl.toString();
}

async function getPageRenderMode() {
  const activeTab = await getWorkbenchTargetTab();

  if (!activeTab?.id) {
    return { ok: false, message: 'No target tab found.' };
  }

  if (!activeTab.url) {
    return { ok: false, message: 'Current tab URL is unavailable.' };
  }

  const parsedUrl = parseUrl(activeTab.url);

  if (!parsedUrl) {
    return { ok: false, message: 'Current tab URL is invalid.' };
  }

  return {
    ok: true,
    csrEnabled: parsedUrl.searchParams.get('__csr') === '1',
    currentUrl: parsedUrl.toString(),
  };
}

async function setPageRenderMode(csrEnabled) {
  const activeTab = await getWorkbenchTargetTab();

  if (!activeTab?.id) {
    return { ok: false, message: 'No target tab found.' };
  }

  if (!activeTab.url) {
    return { ok: false, message: 'Current tab URL is unavailable.' };
  }

  const nextUrl = buildRenderModeUrl(activeTab.url, Boolean(csrEnabled));

  if (!nextUrl) {
    return { ok: false, message: 'Current tab URL is invalid.' };
  }

  if (nextUrl !== activeTab.url) {
    // Update the top-level tab directly so CSR mode does not depend on a content script receiver.
    await chrome.tabs.update(activeTab.id, { url: nextUrl });
  }

  return {
    ok: true,
    csrEnabled: Boolean(csrEnabled),
    currentUrl: nextUrl,
  };
}

function setSwitchBadge(switchValue) {
  // Beta builds get an orange "B·ON/B·OFF" badge so the toolbar icon is
  // visually distinct from the production install at a glance, even when
  // both share the same version number.
  const isBeta = /beta/i.test(chrome.runtime.getManifest().name || '');
  const text = isBeta
    ? (switchValue ? 'B·ON' : 'B·OFF')
    : (switchValue ? 'ON' : 'OFF');
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeTextColor({ color: switchValue ? '#ffffff' : '#333333' });
  chrome.action.setBadgeBackgroundColor({
    color: isBeta
      ? (switchValue ? '#fa8c16' : '#d4886a')
      : (switchValue ? '#4480f7' : '#bfbfbf'),
  });
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (e) {
    return null;
  }
}

function simpleHash(input) {
  let hash = 0;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function normalizeResourceTypes(resourceTypes) {
  const list = Array.isArray(resourceTypes) ? resourceTypes : SUPPORTED_RESOURCE_TYPES;
  const filtered = list.filter((type) => SUPPORTED_RESOURCE_TYPES.includes(type));
  return filtered.length > 0 ? filtered : SUPPORTED_RESOURCE_TYPES;
}

function shouldSkipHeaderKey(headerKey) {
  const lowerKey = headerKey.toLowerCase();
  if (FORBIDDEN_REQUEST_HEADERS.has(lowerKey)) return true;
  if (lowerKey.startsWith('proxy-')) return true;
  if (lowerKey.startsWith('sec-')) return true;
  return false;
}

function normalizeHeaderOperations(headers) {
  if (!Array.isArray(headers)) return [];
  return headers.reduce((acc, item) => {
    const key = String(item?.key || '').trim();
    if (!key || shouldSkipHeaderKey(key)) return acc;
    const operation = item?.operation === 'remove' ? 'remove' : 'set';
    if (operation === 'remove') {
      acc.push({ header: key, operation });
      return acc;
    }
    acc.push({
      header: key,
      operation,
      value: String(item?.value ?? ''),
    });
    return acc;
  }, []);
}

function buildRuleId(profileId, ruleId, usedRuleIds) {
  const seed = `${profileId}:${ruleId}`;
  let value = RULE_ID_BASE + (simpleHash(seed) % RULE_ID_RANGE);
  while (usedRuleIds.has(value)) {
    value += 1;
  }
  usedRuleIds.add(value);
  return value;
}

function compileDynamicRules(profiles) {
  const usedRuleIds = new Set();
  const rules = [];
  const profileList = Array.isArray(profiles) ? profiles : [];

  profileList.forEach((profile) => {
    if (!profile?.enabled) return;
    const profileId = String(profile.id || 'default');
    const profileRules = Array.isArray(profile.rules) ? profile.rules : [];
    profileRules.forEach((rule) => {
      if (!rule?.enabled) return;
      const ruleId = String(rule.id || '');
      if (!ruleId) return;
      const urlFilter = String(rule?.condition?.urlFilter || '').trim();
      if (!urlFilter) return;
      const requestHeaders = normalizeHeaderOperations(rule.headers);
      if (requestHeaders.length < 1) return;
      rules.push({
        id: buildRuleId(profileId, ruleId, usedRuleIds),
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders,
        },
        condition: {
          urlFilter,
          resourceTypes: normalizeResourceTypes(rule?.condition?.resourceTypes),
        },
      });
    });
  });

  return rules;
}

function createDefaultProfiles() {
  return [
    {
      id: 'default',
      name: 'Default',
      enabled: true,
      rules: [],
    },
  ];
}

function makeRuleForOrigin(origin, config) {
  const parsed = parseUrl(origin);
  if (!parsed?.hostname) return null;
  const headers = config?.headers && typeof config.headers === 'object' ? config.headers : {};
  const headerList = Object.keys(headers).map((key) => ({
    key,
    value: String(headers[key] ?? ''),
    operation: 'set',
  }));
  return {
    id: `origin:${parsed.origin}`,
    name: parsed.origin,
    enabled: config?.enabled !== false,
    condition: {
      urlFilter: `||${parsed.hostname}^`,
      resourceTypes: SUPPORTED_RESOURCE_TYPES,
    },
    headers: headerList,
  };
}

function migrateLegacyPageHeaders(legacyMap) {
  const rules = Object.keys(legacyMap || {})
    .map((origin) => makeRuleForOrigin(origin, legacyMap[origin]))
    .filter(Boolean);
  return [
    {
      id: 'default',
      name: 'Default',
      enabled: true,
      rules,
    },
  ];
}

async function ensureHeaderProfilesStorage() {
  const storage = await chrome.storage.local.get([HEADER_PROFILES_STORAGE_KEY, LEGACY_PAGE_HEADERS_STORAGE_KEY]);
  if (Array.isArray(storage[HEADER_PROFILES_STORAGE_KEY])) {
    return storage[HEADER_PROFILES_STORAGE_KEY];
  }
  const legacyMap = storage[LEGACY_PAGE_HEADERS_STORAGE_KEY];
  const profiles = legacyMap && typeof legacyMap === 'object'
    ? migrateLegacyPageHeaders(legacyMap)
    : createDefaultProfiles();
  await chrome.storage.local.set({
    [HEADER_PROFILES_STORAGE_KEY]: profiles,
  });
  return profiles;
}

async function syncHeaderRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  const profiles = await ensureHeaderProfilesStorage();
  const storage = await chrome.storage.local.get([MANAGED_RULE_IDS_STORAGE_KEY]);
  const managedRuleIds = Array.isArray(storage[MANAGED_RULE_IDS_STORAGE_KEY])
    ? storage[MANAGED_RULE_IDS_STORAGE_KEY]
    : [];
  const nextRules = compileDynamicRules(profiles);
  const nextRuleIds = nextRules.map((rule) => rule.id);
  const removeRuleIds = Array.from(new Set([...managedRuleIds, ...nextRuleIds]));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: nextRules,
  });
  await chrome.storage.local.set({
    [MANAGED_RULE_IDS_STORAGE_KEY]: nextRuleIds,
  });
}

// Interceptor master switch OFF → flip every header rule's enabled flag to
// false and re-sync DNR so all dynamic rules are removed. Rules are persisted
// disabled so they do NOT auto-resume when the Interceptor is re-enabled; each
// origin must be toggled back on manually from the Page Headers UI.
async function disableAllHeaderRules() {
  const profiles = await ensureHeaderProfilesStorage();
  const nextProfiles = profiles.map((profile) => ({
    ...profile,
    rules: (Array.isArray(profile.rules) ? profile.rules : []).map((rule) => ({
      ...rule,
      enabled: false,
    })),
  }));
  await chrome.storage.local.set({ [HEADER_PROFILES_STORAGE_KEY]: nextProfiles });
  // The storage.onChanged listener also triggers syncHeaderRules, but call it
  // explicitly to guarantee DNR removal even when profiles were unchanged.
  await syncHeaderRules();
}

// The extension uses optional_host_permissions so the store install does not
// request broad host access up front. The first toolbar click is a valid user
// gesture, which is the only context chrome.permissions.request() may run in.
const OPTIONAL_HOST_ORIGINS = ['http://*/*', 'https://*/*'];

async function hasHostPermissions() {
  return chrome.permissions.contains({ origins: OPTIONAL_HOST_ORIGINS });
}

async function requestHostPermissions() {
  try {
    return await chrome.permissions.request({ origins: OPTIONAL_HOST_ORIGINS });
  } catch (error) {
    logDev('[ajax-tools] request host permissions failed', error);
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }

  // First-run gate: prompt the user to grant host access. Until granted, the
  // content script is not injected and DNR header rules cannot modify
  // requests. After granting, ensurePanelMessageReceiver will inject the
  // content script via chrome.scripting so the panel opens without a reload.
  const alreadyGranted = await hasHostPermissions();
  const granted = alreadyGranted || await requestHostPermissions();
  if (!granted) {
    return;
  }

  await chrome.storage.local.set({
    [WORKBENCH_TARGET_TAB_ID_STORAGE_KEY]: tab.id,
  });

  await toggleIframeVisibility();
});

chrome.storage.local.get(['ajaxToolsSwitchOn'], (result) => {
  const { ajaxToolsSwitchOn = true } = result;
  setSwitchBadge(ajaxToolsSwitchOn);
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key === 'ajaxToolsSwitchOn') {
      setSwitchBadge(newValue);
      // Master switch OFF → strip all DNR header rules. Profile rules are
      // persisted disabled so they do NOT auto-resume when the Interceptor is
      // re-enabled; each origin must be toggled back on manually.
      if (newValue === false) {
        disableAllHeaderRules().catch((error) => {
          console.error('[ajax-tools] disable header rules on interceptor-off failed', error);
        });
      }
    }
    if (key === HEADER_PROFILES_STORAGE_KEY || key === LEGACY_PAGE_HEADERS_STORAGE_KEY) {
      syncHeaderRules().catch((error) => {
        console.error('[ajax-tools] sync header rules failed', error);
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SYNC_PAGE_HEADERS_RULES') {
    syncHeaderRules()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error?.message || 'sync failed' }));
    return true;
  }

  if (message?.type === 'GET_PAGE_RENDER_MODE') {
    getPageRenderMode()
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, message: error?.message || 'render mode sync failed' }));
    return true;
  }

  if (message?.type === 'SET_PAGE_RENDER_MODE') {
    setPageRenderMode(message?.csrEnabled)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, message: error?.message || 'render mode sync failed' }));
    return true;
  }

  if (message?.type === 'CHECK_UPDATE') {
    // Store builds never check for updates (the Web Store delivers them), so
    // respond disabled instead of hitting GitHub. The footer UI is also
    // hidden in store builds, so this branch is defensive only.
    if (IS_STORE_BUILD) {
      sendResponse({ ok: true, hasUpdate: false, disabled: true, localVersion: chrome.runtime.getManifest().version });
      return true;
    }
    // Record which page tab initiated the check so RELOAD_EXTENSION can
    // refresh only that tab (not the update tab or other tabs).
    if (sender?.tab?.id) {
      lastWorkbenchTabId = sender.tab.id;
    }
    checkForUpdate(Boolean(message?.force))
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, hasUpdate: false, message: error?.message || 'update check failed' }));
    return true;
  }

  if (message?.type === 'RELOAD_EXTENSION') {
    // Store builds do not self-reload; updates are applied by the browser.
    if (IS_STORE_BUILD) {
      sendResponse({ ok: false, disabled: true, message: 'Self-update is disabled in the Web Store build.' });
      return true;
    }
    // Only refresh the original page tab that triggered the update, not all
    // tabs. lastWorkbenchTabId was recorded when CHECK_UPDATE came in from
    // the iframe (which runs in the page tab).
    try {
      if (lastWorkbenchTabId) {
        chrome.tabs.reload(lastWorkbenchTabId, { bypassCache: true }).catch(() => {});
      }
      setTimeout(() => chrome.runtime.reload(), 300);
    } catch (error) {
      sendResponse({ ok: false, message: error?.message || 'reload failed' });
    }
    return true;
  }

  if (message?.type === 'SET_GITHUB_TOKEN') {
    // The token only lifts the GitHub API rate limit for self-update checks,
    // which never run in store builds — refuse to persist it so no auth
    // material is collected in a store-distributed extension.
    if (IS_STORE_BUILD) {
      sendResponse({ ok: true, disabled: true });
      return true;
    }
    chrome.storage.local.set({ ajaxToolsGithubToken: message?.token || '' }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  syncHeaderRules().catch((error) => {
    console.error('[ajax-tools] sync header rules failed onInstalled', error);
  });
  logDev('%c Mock Fetch Data onInstalled', 'color: #3aa757');
});

chrome.runtime.onStartup.addListener(() => {
  syncHeaderRules().catch((error) => {
    console.error('[ajax-tools] sync header rules failed onStartup', error);
  });
});

// ----- Self-update: check GitHub Releases and guide the user to install. -----
// MV3 forbids an extension from silently replacing its own files, so the
// best UX we can offer is: detect a new release → download the zip to the
// user's Downloads folder → open chrome://extensions so the user can drag
// the zip in (developer mode) or click "Load unpacked" on the unzipped dir.

const GITHUB_REPO = 'robbiemie/smart-chrome-tool';
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 6; // 6h
const UPDATE_LAST_CHECK_KEY = 'ajaxToolsUpdateLastCheckAt';
const UPDATE_AVAILABLE_KEY = 'ajaxToolsUpdateAvailable';
const DOWNLOAD_PREFIX = 'smart-chrome-tool-v';

// Compare two semver-like strings (a.b.c). Returns 1 if remote > local,
// 0 if equal, -1 if remote < local.
function compareVersions(remote, local) {
  const r = String(remote || '').replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  const l = String(local || '').replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(r.length, l.length); i += 1) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return 1;
    if (rv < lv) return -1;
  }
  return 0;
}

// Fetch the latest release from GitHub and decide whether it's newer than
// the currently installed manifest version. Returns a payload describing
// the update (or its absence) so the UI can show a badge / trigger apply.
//
// Strategy: try the REST API first (rich metadata). On any failure
// (403 rate limit, 5xx, network error) fall back to scraping the public
// releases HTML page — that page is NOT rate-limited and 302-redirects to
// /releases/tag/<tag>, so we can recover the tag from the redirect URL and
// the zip asset link from the page HTML. The HTML path yields less metadata
// (no release notes / publish time) but keeps update detection working when
// the API is unavailable — which is the common case behind shared IPs.
async function fetchLatestRelease() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  logDev('[MockKit Update SW] fetchLatestRelease', apiUrl);

  const localVersion = chrome.runtime.getManifest().version;

  const parseRelease = async (headers) => {
    const response = await fetch(apiUrl, { headers });
    logDev('[MockKit Update SW] GitHub API response', { status: response.status, ok: response.ok, authenticated: !!headers.Authorization });
    return response;
  };

  let response = await parseRelease({ Accept: 'application/vnd.github+json' });

  // Rate-limited anonymous request — retry with token if available.
  if (response.status === 403) {
    logDev('[MockKit Update SW] anonymous 403, trying with token');
    const stored = await chrome.storage.local.get(['ajaxToolsGithubToken']);
    const token = stored?.ajaxToolsGithubToken || '';
    if (token) {
      response = await parseRelease({
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      });
    }
  }

  // API succeeded — parse the rich JSON payload.
  if (response.ok) {
    const data = await response.json();
    const remoteTag = data.tag_name || '';
    logDev('[MockKit Update SW] versions', { remoteTag, localVersion });

    const assets = Array.isArray(data.assets) ? data.assets : [];
    const namedAsset = assets.find((a) => a.name && a.name.startsWith(DOWNLOAD_PREFIX) && a.name.endsWith('.zip'));
    const asset = namedAsset || assets[0];
    logDev('[MockKit Update SW] asset', { named: !!namedAsset, name: asset?.name, downloadUrl: asset?.browser_download_url, zipballUrl: data.zipball_url });

    const result = {
      hasUpdate: compareVersions(remoteTag, localVersion) > 0,
      remoteVersion: remoteTag,
      localVersion,
      downloadUrl: asset?.browser_download_url || data.zipball_url || '',
      releaseUrl: data.html_url || '',
      releaseNotes: data.body || '',
      publishedAt: data.published_at || '',
      source: 'api',
    };
    logDev('[MockKit Update SW] fetchLatestRelease result', result);
    return result;
  }

  // API failed (rate limit / 5xx / network) — fall back to the releases
  // HTML page. github.com/.../releases/latest is an ordinary web page with
  // no per-IP rate limit, and it 302-redirects to /releases/tag/<tag>.
  logDev('[MockKit Update SW] API unavailable (' + response.status + '), falling back to HTML scrape');
  return fetchLatestReleaseViaHtml(localVersion);
}

// HTML fallback: fetch the public releases/latest page, recover the tag from
// the final (redirected) URL, and extract the zip asset link from the HTML.
// Best-effort — if parsing fails we surface a clear error so the UI can show
// "no update" rather than a misleading "rate limited" message.
async function fetchLatestReleaseViaHtml(localVersion) {
  const pageUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;
  logDev('[MockKit Update SW] HTML fallback', pageUrl);

  // redirect: 'follow' (default) — response.url holds the final /tag/<tag> URL.
  let htmlResponse;
  try {
    htmlResponse = await fetch(pageUrl, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
  } catch (networkErr) {
    console.error('[MockKit Update SW] HTML fallback network error', networkErr);
    throw new Error('GitHub API and releases page both unavailable (network error)');
  }

  if (!htmlResponse.ok) {
    console.error('[MockKit Update SW] HTML fallback failed', { status: htmlResponse.status });
    throw new Error(`GitHub releases page responded ${htmlResponse.status}`);
  }

  // Recover the tag from the final URL: .../releases/tag/v0.0.35
  const finalUrl = htmlResponse.url || '';
  const tagMatch = finalUrl.match(/\/releases\/tag\/([^/?#]+)/);
  const remoteTag = tagMatch ? decodeURIComponent(tagMatch[1]) : '';
  if (!remoteTag) {
    console.error('[MockKit Update SW] HTML fallback could not parse tag from', finalUrl);
    throw new Error('Could not determine latest release tag');
  }

  const html = await htmlResponse.text();

  // Extract the zip asset download link. GitHub renders asset links as
  // href="/<repo>/releases/download/<tag>/<asset-name>". Match the zip we ship.
  const assetRegex = new RegExp(
    `href="(/${GITHUB_REPO.replace(/\//g, '\\/')}/releases/download/${remoteTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"]*\\.zip)"`,
    'i'
  );
  const assetMatch = html.match(assetRegex);
  const downloadUrl = assetMatch
    ? `https://github.com${assetMatch[1]}`
    : `https://github.com/${GITHUB_REPO}/releases/download/${remoteTag}/${DOWNLOAD_PREFIX}${remoteTag.replace(/^v/, '')}.zip`;

  const releaseUrl = `https://github.com/${GITHUB_REPO}/releases/tag/${remoteTag}`;
  const result = {
    hasUpdate: compareVersions(remoteTag, localVersion) > 0,
    remoteVersion: remoteTag,
    localVersion,
    downloadUrl,
    releaseUrl,
    releaseNotes: '', // HTML scrape does not recover the release body reliably
    publishedAt: '',
    source: 'html',
  };
  logDev('[MockKit Update SW] HTML fallback result', result);
  return result;
}

// Throttled check used by the background tick and on-demand UI requests.
// Stores the result so the badge stays accurate without re-hitting the API
// on every popup open.
async function checkForUpdate(force = false) {
  logDev('[MockKit Update SW] checkForUpdate', { force });
  const now = Date.now();
  const stored = await chrome.storage.local.get({ [UPDATE_LAST_CHECK_KEY]: 0, [UPDATE_AVAILABLE_KEY]: null });
  if (!force && stored[UPDATE_LAST_CHECK_KEY] && now - stored[UPDATE_LAST_CHECK_KEY] < UPDATE_CHECK_INTERVAL_MS) {
    logDev('[MockKit Update SW] using cached result', stored[UPDATE_AVAILABLE_KEY]);
    return stored[UPDATE_AVAILABLE_KEY] || { hasUpdate: false, localVersion: chrome.runtime.getManifest().version };
  }

  try {
    const result = await fetchLatestRelease();
    logDev('[MockKit Update SW] storing result', result);
    await chrome.storage.local.set({
      [UPDATE_LAST_CHECK_KEY]: now,
      [UPDATE_AVAILABLE_KEY]: result,
    });
    return result;
  } catch (error) {
    console.error('[MockKit Update SW] checkForUpdate failed', error);
    return {
      hasUpdate: false,
      error: error?.message || 'update check failed',
      localVersion: chrome.runtime.getManifest().version,
    };
  }
}

// The actual download/unzip/write flow runs in the workbench iframe (it
// needs the File System Access API, which requires a secure context). The
// service worker only provides CHECK_UPDATE above and RELOAD_EXTENSION below
// to apply the freshly written files.

// Background tick: re-check on a fixed cadence so the badge appears without
// user interaction. chrome.alarms is the MV3-correct timer primitive.
// Disabled in store builds — the Web Store owns update delivery, so the
// extension never polls GitHub.
if (!IS_STORE_BUILD) {
  chrome.alarms?.create?.('ajax-tools-update-check', { periodInMinutes: 60 * 6 });
  chrome.alarms?.onAlarm?.addListener?.((alarm) => {
    if (alarm?.name === 'ajax-tools-update-check') {
      checkForUpdate(false).catch(() => {});
    }
  });

  // Run one check shortly after startup/install so the badge reflects the
  // latest state without waiting for the first alarm tick. On install/update
  // we clear the stale cached result first so a just-applied update doesn't
  // keep showing a red dot from the pre-update check.
  chrome.runtime.onStartup.addListener(() => {
    setTimeout(() => checkForUpdate(false).catch(() => {}), 5000);
  });
  chrome.runtime.onInstalled.addListener((details) => {
    if (details?.reason === 'update') {
      chrome.storage.local.remove([UPDATE_AVAILABLE_KEY, UPDATE_LAST_CHECK_KEY], () => {
        setTimeout(() => checkForUpdate(true).catch(() => {}), 2000);
      });
    } else {
      setTimeout(() => checkForUpdate(false).catch(() => {}), 5000);
    }
  });
}
