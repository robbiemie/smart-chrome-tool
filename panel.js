// DevTools panel logic.
//
// The MockKit workbench is the existing React iframe mounted on the inspected
// page by content.js. This panel only acts as a launcher: it asks the service
// worker to ensure content.js is present on the inspected tab and to reveal
// the iframe. Keeping the UI on the page (not inside the panel) means we
// reuse 100% of the existing workbench, message bus, and page-script hooks.
//
// Why this works where the toolbar action sometimes cannot: the DevTools page
// is permitted in many enterprise-managed browsers that gate content-script
// auto-injection, and chrome.scripting.executeScript triggered from here goes
// through the same host_permissions the extension already holds.

const statusEl = document.getElementById('mk-status');
const descEl = document.getElementById('mk-desc');
const retryBtn = document.getElementById('mk-retry');
const betaBadge = document.getElementById('mk-beta-badge');
const titleText = document.getElementById('mk-title-text');

// Reflect the manifest name (set by build.js --beta) so the panel header
// matches the panel tab label and the chrome://extensions entry.
const manifestName = chrome.runtime.getManifest().name || '';
if (/beta/i.test(manifestName)) {
  betaBadge.hidden = false;
  titleText.textContent = 'MockKit Beta Workbench';
}

function setStatus(state, label, desc) {
  statusEl.className = `mk-status mk-status--${state}`;
  statusEl.textContent = label;
  if (desc) descEl.textContent = desc;
  retryBtn.hidden = state !== 'err';
}

async function mountWorkbenchOnInspectedTab() {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  if (typeof tabId !== 'number') {
    setStatus('err', 'failed', 'No inspected tab available.');
    return;
  }

  // Restricted schemes cannot host the iframe even via re-injection.
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !tab.url || /^(chrome|chrome-extension|edge|about|view-source):/i.test(tab.url)) {
    setStatus('err', 'blocked', 'Cannot mount on this page scheme (chrome:// / extension pages are blocked by Chrome).');
    return;
  }

  setStatus('', 'mounting', 'Ensuring the content runtime is present on the inspected page...');

  const response = await chrome.runtime.sendMessage({
    type: 'DEVTOOLS_SHOW_WORKBENCH',
    tabId,
  }).catch((error) => ({ ok: false, message: error?.message || 'runtime messaging failed' }));

  if (response?.ok) {
    setStatus('ok', 'mounted', 'Workbench is mounted on the inspected page. Look at the right side of the page (or the floating rules panel at bottom-right).');
  } else {
    setStatus('err', 'failed', response?.message || 'Mount failed.');
  }
}

retryBtn.addEventListener('click', mountWorkbenchOnInspectedTab);

// Mount on first open. Re-shows are cheap because ensurePanelMessageReceiver
// pings first and only re-injects if the content script is missing.
mountWorkbenchOnInspectedTab();
