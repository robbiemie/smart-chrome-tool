const HEADER_PROFILES_STORAGE_KEY = 'ajaxToolsHeaderProfiles';
const LEGACY_PAGE_HEADERS_STORAGE_KEY = 'ajaxToolsPageHeadersMap';
const MANAGED_RULE_IDS_STORAGE_KEY = 'ajaxToolsManagedHeaderRuleIds';
const RULE_ID_BASE = 930000;
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
      resolve(response);
    });
  });
}

async function toggleIframeVisibility() {
  const { iframeVisible } = await chrome.storage.local.get({ iframeVisible: true });
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await sendMessageToContentScript(tabs[0].id, { type: 'iframeToggle', iframeVisible });
  await chrome.storage.local.set({ iframeVisible: Boolean(response?.nextIframeVisible) });
}

function setSwitchBadge(switchValue) {
  chrome.action.setBadgeText({ text: switchValue ? 'ON' : 'OFF' });
  chrome.action.setBadgeTextColor({ color: switchValue ? '#ffffff' : '#333333' });
  chrome.action.setBadgeBackgroundColor({ color: switchValue ? '#4480f7' : '#bfbfbf' });
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

chrome.action.onClicked.addListener(async () => {
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
    }
    if (key === HEADER_PROFILES_STORAGE_KEY || key === LEGACY_PAGE_HEADERS_STORAGE_KEY) {
      syncHeaderRules().catch((error) => {
        console.error('[ajax-tools] sync header rules failed', error);
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'SYNC_PAGE_HEADERS_RULES') return false;
  syncHeaderRules()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, message: error?.message || 'sync failed' }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  syncHeaderRules().catch((error) => {
    console.error('[ajax-tools] sync header rules failed onInstalled', error);
  });
  console.log('%c Mock Fetch Data onInstalled', 'color: #3aa757');
});

chrome.runtime.onStartup.addListener(() => {
  syncHeaderRules().catch((error) => {
    console.error('[ajax-tools] sync header rules failed onStartup', error);
  });
});
