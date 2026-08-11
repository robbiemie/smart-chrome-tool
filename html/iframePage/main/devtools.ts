/**
 * DevTools panel registration.
 *
 * This script runs in the devtools.html context (a hidden page that opens
 * whenever Chrome DevTools opens). It registers a "MockKit" panel that loads
 * the same React workbench as the iframe side panel, giving users a
 * DevTools-native entry point that is immune to host-page CSP / z-index /
 * style interference.
 *
 * The panel page reuses html/iframePage/dist/index.html directly — the React
 * app is already context-agnostic (all data flows through chrome.storage.local
 * and chrome.runtime.sendMessage). The only iframe-specific input is the
 * `pageOrigin` URL param (used by usePageHeaders for per-origin DNR rules);
 * that is handled by a small DevTools fallback inside usePageHeaders itself.
 */

const PANEL_ICON_PATH = 'icons/tools16.png';
const PANEL_TITLE = 'MockKit';
const PANEL_PAGE = 'html/iframePage/dist/index.html';

// chrome.devtools is only available inside DevTools pages. Guard against
// standalone browser tabs that happen to load this URL (e.g. during dev).
if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.panels) {
  chrome.devtools.panels.create(
    PANEL_TITLE,
    PANEL_ICON_PATH,
    PANEL_PAGE,
  );
}
