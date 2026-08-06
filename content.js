
const AJAX_TOOLS_RUNTIME_STATE_KEY = '__ajaxToolsRuntimeState__';
const AJAX_TOOLS_STYLE_ID = 'mockkit-interceptor-runtime-style';

// Dev-mode logger: production releases (manifest name without "Beta") get
// all logs silenced; beta / dev builds log normally. Same pattern as
// service_worker.js — runtime detection via manifest name.
const isDevMode = (() => {
  try {
    return /beta/i.test(chrome.runtime.getManifest().name || '');
  } catch {
    return false;
  }
})();
const logDev = (...args) => { if (isDevMode) console.log(...args); };

const ajaxToolsRuntimeState = window[AJAX_TOOLS_RUNTIME_STATE_KEY] || (window[AJAX_TOOLS_RUNTIME_STATE_KEY] = {
  panelContainer: null,
  panelMessageListenerBound: false,
  panelMountObserver: null,
  panelInitBound: false,
  floatingPanel: null,
  floatingPanelBound: false,
  floatingRulesEnabled: true,
  // Tracks whether the user has manually dragged the floating rules panel.
  // Once true, the auto-reposition logic (which shifts the panel out of the
  // workbench's footprint) stays hands-off so it never fights the user's
  // explicit placement. Resets only on a fresh panel build.
  floatingPanelDragged: false,
  // Same flag for the Toolkit master panel — once dragged, auto-reposition
  // leaves it alone.
  toolkitPanelDragged: false,
  // Same flag for the Sniffer sub-panel.
  snifferPanelDragged: false,
  // Mirror of the global interceptor switch. The floating rules panel is
  // hidden when the master switch is off, because there is nothing for the
  // panel to toggle when interception is globally paused.
  ajaxToolsSwitchOn: true,
  domainWhitelist: ['*'],
  hitRuleKeys: Object.create(null),
});

// --- Domain whitelist matching -------------------------------------------------
// The floating panel only renders on allowlisted hostnames. Patterns:
//   '*' = all, '*.foo.com' = foo.com + subdomains, 'foo.com' = exact.
function patternToRegExp(pattern) {
  if (!pattern) return /^$/;
  if (pattern === '*') return /^.*$/;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  if (pattern.startsWith('*.')) {
    const rest = escaped.substring(4);
    return new RegExp('^(?:.*\\.)?' + rest + '$', 'i');
  }
  return new RegExp('^' + escaped + '$', 'i');
}

function isHostnameWhitelisted(hostname, patterns) {
  if (!hostname) return false;
  if (!patterns || patterns.length === 0) return false;
  return patterns.some(function (pattern) {
    try { return patternToRegExp(pattern).test(hostname); } catch (e) { return false; }
  });
}

function currentHostWhitelisted() {
  return isHostnameWhitelisted(window.location.hostname, ajaxToolsRuntimeState.domainWhitelist);
}

// 设置iframeVisible默认值，刷新后重置storage
chrome.storage.local.set({iframeVisible: true});

function injectedScript (path) {
  // 只在最顶层嵌入  https://github.com/PengChen96/ajax-tools/issues/18
  if (window.self === window.top) {
    const existingScriptNode = document.documentElement.querySelector(`script[data-ajax-tools-script="${path}"]`);
    if (existingScriptNode) {
      return existingScriptNode;
    }
    const scriptNode = document.createElement('script');
    scriptNode.src= chrome.runtime.getURL(path);
    scriptNode.dataset.ajaxToolsScript = path;
    document.documentElement.appendChild(scriptNode);
    return scriptNode;
  }
}
function injectedCss(path) {
  if (window.self === window.top) {
    const href = chrome.runtime.getURL(path);
    const existingLinkElement = document.documentElement.querySelector(`link[data-ajax-tools-css="${path}"]`);
    if (existingLinkElement) {
      return existingLinkElement;
    }
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = href;
    linkElement.dataset.ajaxToolsCss = path;
    document.documentElement.appendChild(linkElement);
    return linkElement;
  }
}
function injectedStyle(styleContent) {
  if (window.self === window.top) {
    const existingStyleElement = document.getElementById(AJAX_TOOLS_STYLE_ID);
    if (existingStyleElement) {
      return existingStyleElement;
    }
    const styleElement = document.createElement('style');
    styleElement.id = AJAX_TOOLS_STYLE_ID;
    styleElement.textContent = styleContent;
    document.documentElement.appendChild(styleElement);
    return styleElement;
  }
}
injectedStyle(`
  .mockkit-interceptor-container {
    display: flex;
    flex-direction: column;
    height: 100% !important;
    width: 580px !important;
    min-width: 1px !important;
    position: fixed !important;
    inset: 0px 0px auto auto !important;
    z-index: 2147483647 !important;
    transform: translateX(0px) !important;
    transition: all 0.4s ease 0s !important;
    box-shadow: -20px 0 60px rgb(37 54 46 / 15%), 0 0 0 1px rgb(27 40 34 / 6%) !important;
    background: #fff;
    overflow: hidden;
  }
  .ajax-interceptor-action-bar {
    height: 44px;
    min-height: 44px;
    padding: 0 14px 0 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(180deg, rgb(248 245 238 / 80%), rgb(255 255 255 / 90%));
    border-bottom: 1px solid rgb(27 40 34 / 5%);
  }
  .ajax-interceptor-action-bar__group {
    display: flex;
    align-items: center;
  }
  .ajax-interceptor-action-bar__version {
    font-size: 11px;
    font-weight: 600;
    color: rgb(27 40 34 / 45%);
    letter-spacing: 0.02em;
    user-select: none;
    pointer-events: none;
  }
  .mockkit-interceptor-iframe {
    border: none;
    height: calc(100% - 40px);
    width: 100%;
    border-top: 1px solid #d1d3d8;
  }
  .ajax-interceptor-icon {
    cursor: pointer;
    position: relative;
  }
  .ajax-interceptor-new::after {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ff0000;
    position: absolute;
    right: -2px;
    top: -2px;
  }
  .ajax-interceptor-mr-8 {
    margin-right: 8px;
  }
  .mockkit-floating-rules {
    position: fixed !important;
    right: 24px !important;
    top: 24px !important;
    width: 340px !important;
    max-height: calc(100vh - 48px) !important;
    display: none;
    flex-direction: column;
    z-index: 2147483646 !important;
    /* One tier BELOW the workbench (.mockkit-interceptor-container stays at
       2147483647) so the main plugin panel is never obscured by this floating
       box. All four floating overlays (Rules/Sniffer/Toolkit/Animation) share
       this tier, so DOM order decides stacking among them: Rules is appended
       LAST in mountPanelContainer, so it still sits above other top-right
       overlays. Positioning is independent — see repositionFloatingRulesPanel. */
    border: 1px solid rgb(27 40 34 / 8%) !important;
    border-radius: 16px !important;
    box-shadow: 0 20px 60px rgb(37 54 46 / 18%), 0 4px 12px rgb(37 54 46 / 8%) !important;
    background: linear-gradient(160deg, rgb(255 255 255 / 96%), rgb(248 245 238 / 94%)) !important;
    backdrop-filter: blur(20px);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    color: #1b2822;
    transition: box-shadow 0.2s ease;
  }
  .mockkit-floating-rules__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgb(27 40 34 / 6%);
    font-weight: 700;
    font-size: 13px;
    background: linear-gradient(135deg, rgb(255 255 255 / 80%), rgb(247 244 236 / 70%));
    flex-shrink: 0;
    cursor: grab;
    user-select: none;
    letter-spacing: 0.02em;
  }
  .mockkit-floating-rules__header--dragging {
    cursor: grabbing;
    background: linear-gradient(135deg, rgb(26 155 127 / 6%), rgb(247 244 236 / 70%));
  }
  .mockkit-floating-rules__header-left {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .mockkit-floating-rules__group-switch {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .mockkit-floating-rules__group-btn {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 45%);
    font-size: 12px;
    line-height: 1;
    transition: all 0.15s ease;
  }
  .mockkit-floating-rules__group-btn:hover {
    background: rgb(27 40 34 / 8%);
    color: #1b2822;
  }
  .mockkit-floating-rules__group-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .mockkit-floating-rules__title {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mockkit-floating-rules__title::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #1a9b7f;
    flex-shrink: 0;
  }
  .mockkit-floating-rules__count {
    font-weight: 500;
    font-size: 11px;
    color: rgb(27 40 34 / 45%);
    padding: 1px 7px;
    border-radius: 999px;
    background: rgb(27 40 34 / 5%);
  }
  .mockkit-floating-rules__header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .mockkit-floating-rules__csr-btn {
    flex-shrink: 0;
    padding: 3px 8px;
    /* 1px transparent base so border-color changes on hover/active render;
       the old 'border: none' made every border-color rule a no-op. */
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 55%);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    transition: all 0.15s ease;
  }
  .mockkit-floating-rules__csr-btn:hover {
    background: rgb(27 40 34 / 8%);
    border-color: rgb(27 40 34 / 24%);
    color: #1b2822;
  }
  /* Active state: soft green tint. Kept on hover too — previously the
     --on:hover rule omitted 'background', so it fell back to the weaker
     22%-alpha green from the earlier duplicate, making the active state
     nearly invisible while the cursor was over the button. */
  .mockkit-floating-rules__csr-btn--on {
    background: rgb(26 155 127 / 30%);
    border-color: rgb(26 155 127 / 50%);
    color: #1a9b7f;
    box-shadow: 0 2px 8px rgb(26 155 127 / 20%);
  }
  .mockkit-floating-rules__csr-btn--on:hover {
    background: rgb(26 155 127 / 40%);
    border-color: rgb(26 155 127 / 60%);
    color: #fff;
  }
  .mockkit-floating-rules__inspect-btn {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 55%);
    transition: all 0.15s ease;
  }
  .mockkit-floating-rules__inspect-btn:hover {
    background: rgb(27 40 34 / 8%);
    color: #1b2822;
  }
  .mockkit-floating-rules__inspect-btn svg {
    width: 13px;
    height: 13px;
  }
  /* Inspect active state: soft green tint while pick mode is on, mirroring the
     measure button's red tint. Green matches the aim icon's theme so
     inspect-vs-measure stays distinguishable at a glance. */
  .mockkit-floating-rules__inspect-btn--on {
    background: rgb(26 155 127 / 30%);
    color: #1a9b7f;
    box-shadow: inset 0 0 0 1px rgb(26 155 127 / 50%), 0 2px 8px rgb(26 155 127 / 20%);
  }
  .mockkit-floating-rules__inspect-btn--on:hover {
    background: rgb(26 155 127 / 40%);
    color: #1a9b7f;
  }
  .mockkit-floating-rules__close-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 40%);
    transition: all 0.15s ease;
    padding: 0;
  }
  .mockkit-floating-rules__close-btn svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  .mockkit-floating-rules__close-btn:hover {
    background: rgb(27 40 34 / 6%);
    color: rgb(27 40 34 / 70%);
  }
  .mockkit-floating-rules__list {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: 6px;
  }
  .mockkit-floating-rules__list::-webkit-scrollbar {
    width: 6px;
  }
  .mockkit-floating-rules__list::-webkit-scrollbar-thumb {
    background: rgb(27 40 34 / 12%);
    border-radius: 999px;
  }
  .mockkit-floating-rules__list::-webkit-scrollbar-track {
    background: transparent;
  }
  .mockkit-floating-rules__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 10px;
    transition: background 0.15s ease;
  }
  .mockkit-floating-rules__item:hover {
    background: rgb(26 155 127 / 5%);
  }
  /* Custom toggle switch — styled checkbox pill */
  .mockkit-floating-rules__item-toggle {
    flex-shrink: 0;
    appearance: none;
    -webkit-appearance: none;
    width: 30px;
    height: 17px;
    border-radius: 999px;
    background: rgb(27 40 34 / 14%);
    cursor: pointer;
    position: relative;
    transition: background 0.2s ease;
    margin: 0;
  }
  .mockkit-floating-rules__item-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 13px;
    height: 13px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
    transition: transform 0.2s ease;
  }
  .mockkit-floating-rules__item-toggle:checked {
    background: #1a9b7f;
  }
  .mockkit-floating-rules__item-toggle:checked::after {
    transform: translateX(13px);
  }
  .mockkit-floating-rules__item-edit {
    flex-shrink: 0;
    padding: 3px 8px;
    border: none;
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    color: rgb(26 155 127 / 70%);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    opacity: 0;
    transition: all 0.15s ease;
  }
  .mockkit-floating-rules__item:hover .mockkit-floating-rules__item-edit {
    opacity: 1;
  }
  .mockkit-floating-rules__item-edit:hover {
    background: rgb(26 155 127 / 12%);
    color: #1a9b7f;
  }
  .mockkit-floating-rules__item-fork {
    flex-shrink: 0;
    padding: 3px 8px;
    border: none;
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 55%);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    opacity: 0;
    transition: all 0.15s ease;
  }
  .mockkit-floating-rules__item:hover .mockkit-floating-rules__item-fork {
    opacity: 1;
  }
  .mockkit-floating-rules__item-fork:hover {
    background: rgb(27 40 34 / 8%);
    color: #1b2822;
  }
  .mockkit-floating-rules__item-inline-edit {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 45%);
    opacity: 0;
    transition: all 0.15s ease;
  }
  .mockkit-floating-rules__item:hover .mockkit-floating-rules__item-inline-edit {
    opacity: 1;
  }
  .mockkit-floating-rules__item-inline-edit:hover {
    background: rgb(27 40 34 / 8%);
    color: #1b2822;
  }
  .mockkit-floating-rules__item-inline-edit svg {
    width: 13px;
    height: 13px;
  }
  .mockkit-floating-rules__item-inline-edit--active {
    background: rgb(26 155 127 / 14%);
    color: #1a9b7f;
    opacity: 1;
  }
  .mockkit-floating-rules__item-input {
    width: 100%;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #1b2822;
    border: 1px solid rgb(26 155 127 / 35%);
    border-radius: 5px;
    padding: 2px 6px;
    background: rgb(255 255 255 / 90%);
    outline: none;
    line-height: 1.4;
  }
  .mockkit-floating-rules__item-input:focus {
    border-color: #1a9b7f;
    box-shadow: 0 0 0 2px rgb(26 155 127 / 15%);
  }
  .mockkit-floating-rules__item-input--note {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 10px;
    margin-top: 4px;
  }
  /* Hit indicator: green dot that lights up once the rule matches a request. */
  .mockkit-floating-rules__item-hit {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgb(27 40 34 / 12%);
    transition: background 0.2s ease, box-shadow 0.2s ease;
  }
  .mockkit-floating-rules__item-hit--on {
    background: #1a9b7f;
    box-shadow: 0 0 6px rgb(26 155 127 / 55%);
  }
  .mockkit-floating-rules__item-body {
    flex: 1;
    min-width: 0;
  }
  .mockkit-floating-rules__item-url {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #1b2822;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }
  .mockkit-floating-rules__item-note {
    color: rgb(27 40 34 / 45%);
    font-size: 10px;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mockkit-floating-rules__empty {
    padding: 32px 16px;
    text-align: center;
    color: rgb(27 40 34 / 35%);
    font-size: 12px;
    line-height: 1.6;
  }

  /* DOM Inspector overlay: highlight ring shown while picking a node. */
  .mockkit-dom-inspector-overlay {
    position: fixed;
    z-index: 2147483646;
    pointer-events: none;
    border: 2px solid #1a9b7f;
    background: rgb(26 155 127 / 12%);
    transition: all 0.05s ease;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 80%), 0 4px 16px rgb(26 155 127 / 30%);
    border-radius: 3px;
    display: none;
  }
  /* Margin highlight: a dashed blue box enclosing the element's margin box,
     shown alongside the green inspect overlay so margins are visible on the
     page. Color matches the Box Model diagram's margin layer. Sits one
     z-level below the green overlay. */
  .mockkit-dom-inspector-margin-overlay {
    position: fixed;
    z-index: 2147483645;
    pointer-events: none;
    border: 1px dashed #3b82f6;
    background: rgb(59 130 246 / 6%);
    border-radius: 2px;
    display: none;
  }
  /* Persistent box-model overlay for a picked node. Renders the full margin /
     border / padding / content stack on the page with value badges at each
     edge so the user can see spacing extents + numbers at a glance. Appended
     to <html> (never <body>) so page stacking contexts can't trap it. */
  .mockkit-box-model-overlay {
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    box-sizing: border-box;
  }
  .mockkit-box-model-overlay__margin {
    position: absolute;
    inset: 0;
    border: 1px dashed #f59e0b;
    background: rgb(245 158 11 / 8%);
    border-radius: 3px;
  }
  .mockkit-box-model-overlay__border {
    position: absolute;
    border: 1px solid #374151;
    background: rgb(55 65 81 / 35%);
    box-sizing: border-box;
  }
  .mockkit-box-model-overlay__padding {
    position: absolute;
    border: 1px dashed #10b981;
    background: rgb(16 185 129 / 15%);
    box-sizing: border-box;
  }
  .mockkit-box-model-overlay__content {
    position: absolute;
    border: 1px dotted #3b82f6;
    background: rgb(59 130 246 / 45%);
    box-sizing: border-box;
  }
  .mockkit-box-model-overlay__label {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 1px 5px;
    border-radius: 4px;
    font: 600 11px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #fff;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgb(0 0 0 / 45%);
  }
  .mockkit-box-model-overlay__label--margin { background: #f59e0b; }
  .mockkit-box-model-overlay__label--padding { background: #10b981; }
  .mockkit-box-model-overlay__label--zero { opacity: 0.4; }
  /* Measure mode overrides the hover-overlay color to orange so the hovered
     element B is visually distinct from: the green inspect-mode hover, the
     blue anchor A, and the red measurement guides. Toggled by
     start/stopDomInspector based on the active mode. */
  .mockkit-dom-inspector-overlay--measure {
    border-color: #fa8c16;
    background: rgb(250 140 22 / 12%);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 80%), 0 4px 16px rgb(250 140 22 / 30%);
  }
  /* Anchor overlay: persistent blue highlight marking the locked baseline
     element A. Visually distinct from the green hover overlay so the user can
     tell "what I picked as reference" from "what I'm hovering". */
  .mockkit-dom-inspector-anchor-overlay {
    position: fixed;
    z-index: 2147483646;
    pointer-events: none;
    border: 2px solid #1677ff;
    background: rgb(22 119 255 / 10%);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 80%), 0 4px 16px rgb(22 119 255 / 25%);
    border-radius: 3px;
    display: none;
  }
  /* Info label pinned to the top-right of the highlight overlay, showing the
     element's selector and size while hovering — same UX as Chrome DevTools. */
  .mockkit-dom-inspector-overlay__label {
    position: fixed;
    z-index: 2147483646;
    pointer-events: none;
    padding: 2px 8px;
    border-radius: 4px;
    background: #1a9b7f;
    color: #fff;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
    display: none;
    box-shadow: 0 2px 8px rgb(26 155 127 / 40%);
    display: none;
  }
  /* Measure-mode label color matches the orange hover overlay. */
  .mockkit-dom-inspector-overlay__label--measure {
    background: #fa8c16;
    box-shadow: 0 2px 8px rgb(250 140 22 / 40%);
  }
  .mockkit-dom-inspector-measurements__line {
    position: fixed;
    z-index: 2147483645;
    pointer-events: none;
    background: #ff4d4f;
  }
  /* Diagonal gap rect: semi-transparent red fill + 1px border marking the
     blank region enclosed by two non-aligned elements. Replaces the old
     three-line diagonal rendering for a more intuitive "here is the gap".
     Sits above the green/blue highlight overlays so the gap region stays
     visible even when it overlaps an element's highlight border. */
  .mockkit-dom-inspector-measurements__rect {
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    background: rgb(255 77 79 / 12%);
    border: 1px solid #ff4d4f;
    box-sizing: border-box;
  }
  .mockkit-dom-inspector-measurements__label {
    position: fixed;
    z-index: 2147483645;
    pointer-events: none;
    padding: 1px 5px;
    border-radius: 3px;
    background: #ff4d4f;
    color: #fff;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }

  /* DOM Inspector result panel: top-left so it never overlaps the rules
     floating panel anchored top-right. */
  .mockkit-dom-inspector {
    position: fixed;
    z-index: 2147483647;
    top: 24px;
    left: 24px;
    width: 340px;
    max-width: calc(100vw - 48px);
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    border: 1px solid rgb(27 40 34 / 8%);
    background: rgb(255 255 255 / 92%);
    backdrop-filter: blur(20px);
    box-shadow: 0 24px 80px rgb(37 54 46 / 14%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    color: #1b2822;
    overflow: hidden;
  }
  /* Minimized state: shrink to just the header bar, hide body. */
  .mockkit-dom-inspector--minimized {
    width: auto !important;
    max-height: none !important;
  }
  .mockkit-dom-inspector--minimized .mockkit-dom-inspector__body {
    display: none !important;
  }
  .mockkit-dom-inspector--minimized .mockkit-dom-inspector__header {
    border-bottom: none;
  }
  .mockkit-dom-inspector__min-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 45%);
    font-size: 14px;
    line-height: 1;
    transition: all 0.15s ease;
  }
  .mockkit-dom-inspector__min-btn:hover {
    background: rgb(27 40 34 / 8%);
    color: #1b2822;
  }
  .mockkit-dom-inspector__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid rgb(27 40 34 / 6%);
    cursor: move;
    user-select: none;
  }
  .mockkit-dom-inspector__title {
    font-size: 12px;
    font-weight: 600;
    color: #1b2822;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mockkit-dom-inspector__close {
    flex-shrink: 0;
    padding: 2px 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 45%);
    font-size: 16px;
    line-height: 1;
    border-radius: 4px;
  }
  .mockkit-dom-inspector__reinspect {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 55%);
    transition: all 0.15s ease;
    margin-left: auto;
  }
  .mockkit-dom-inspector__reinspect:hover {
    background: rgb(27 40 34 / 8%);
    color: #1b2822;
  }
  /* Reinspect active state: soft green tint while inspect pick mode is on, so the
     user can tell from the DOM Inspector panel header that a pick is pending. */
  .mockkit-dom-inspector__reinspect--on {
    background: rgb(26 155 127 / 30%);
    color: #1a9b7f;
    box-shadow: inset 0 0 0 1px rgb(26 155 127 / 50%), 0 2px 8px rgb(26 155 127 / 20%);
  }
  .mockkit-dom-inspector__reinspect--on:hover {
    background: rgb(26 155 127 / 40%);
    color: #1a9b7f;
  }
  .mockkit-dom-inspector__reinspect svg {
    width: 13px;
    height: 13px;
  }
  /* Measure button on the DOM Inspector panel header (NOT the mock floating
     rules panel). Red ruler icon, distinct from the green reinspect aim icon
     next to it. Pulses red while measure mode is active so the user knows
     it's on. */
  .mockkit-dom-inspector__measure-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    color: rgb(27 40 34 / 55%);
    transition: all 0.15s ease;
  }
  .mockkit-dom-inspector__measure-btn:hover {
    background: rgb(27 40 34 / 8%);
    color: #1b2822;
  }
  .mockkit-dom-inspector__measure-btn svg {
    width: 13px;
    height: 13px;
  }
  .mockkit-dom-inspector__measure-btn--on {
    background: rgb(255 77 79 / 30%);
    color: #ff4d4f;
    box-shadow: inset 0 0 0 1px rgb(255 77 79 / 50%), 0 2px 8px rgb(255 77 79 / 20%);
    animation: mockkit-dom-inspector-measure-pulse 1.6s ease-in-out infinite;
  }
  .mockkit-dom-inspector__measure-btn--on:hover {
    background: rgb(255 77 79 / 40%);
    color: #ff4d4f;
  }
  @keyframes mockkit-dom-inspector-measure-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgb(255 77 79 / 35%); }
    50% { box-shadow: 0 0 0 5px rgb(255 77 79 / 0%); }
  }
  .mockkit-dom-inspector__close:hover {
    background: rgb(27 40 34 / 8%);
    color: #1b2822;
  }
  .mockkit-dom-inspector__body {
    flex: 1;
    overflow: auto;
    padding: 10px 14px;
  }
  .mockkit-dom-inspector__hint {
    color: rgb(27 40 34 / 45%);
    font-size: 12px;
    line-height: 1.7;
    padding: 8px 0;
  }
  .mockkit-dom-inspector__tag {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgb(26 155 127 / 12%);
    color: #1a9b7f;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .mockkit-dom-inspector__tag:hover {
    background: rgb(26 155 127 / 22%);
  }
  .mockkit-dom-inspector__tag-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .mockkit-dom-inspector__section {
    margin-bottom: 10px;
  }
  .mockkit-dom-inspector__section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgb(27 40 34 / 45%);
    margin-bottom: 4px;
  }
  .mockkit-dom-inspector__props {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.7;
    color: #1b2822;
    background: #f5f7f6;
    border-radius: 8px;
    padding: 8px 10px;
    max-height: 200px;
    overflow: auto;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .mockkit-dom-inspector__prop-key {
    color: rgb(26 155 127 / 85%);
  }
  .mockkit-dom-inspector__prop-val {
    color: #1b2822;
  }
  .mockkit-dom-inspector__core-panel {
    border: 1px solid rgb(27 40 34 / 8%);
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 10px;
    background: rgb(255 255 255 / 50%);
  }
  .mockkit-dom-inspector__core-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .mockkit-dom-inspector__core-panel-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgb(27 40 34 / 45%);
  }
  .mockkit-dom-inspector__core-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0;
    font-size: 11px;
    table-layout: fixed;
  }
  .mockkit-dom-inspector__core-table thead th {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgb(27 40 34 / 45%);
    text-align: left;
    padding: 4px 8px;
    border-bottom: 1px solid rgb(27 40 34 / 8%);
    background: #f5f7f6;
  }
  .mockkit-dom-inspector__core-row:nth-child(even) td {
    background: rgb(27 40 34 / 2%);
  }
  .mockkit-dom-inspector__core-cell {
    padding: 6px 8px;
    vertical-align: top;
    border-bottom: 1px solid rgb(27 40 34 / 5%);
    word-break: break-word;
  }
  .mockkit-dom-inspector__core-cell--label {
    width: 38%;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgb(27 40 34 / 45%);
  }
  .mockkit-dom-inspector__core-cell--value {
    font-family: Menlo, Monaco, Consolas, monospace;
    color: #1b2822;
  }
  .mockkit-dom-inspector__core-editor {
    margin-top: 4px;
  }
  .mockkit-dom-inspector__summary-value {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #1b2822;
    word-break: break-word;
  }
  .mockkit-dom-inspector__summary-value--copyable {
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .mockkit-dom-inspector__summary-value--copyable:hover {
    color: #1a9b7f;
  }
  .mockkit-dom-inspector__summary-value--copied {
    color: #1a9b7f;
  }
  .mockkit-dom-inspector__color-toggle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 6px;
    border: 1px solid rgb(27 40 34 / 12%);
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    color: rgb(27 40 34 / 55%);
    transition: all 0.15s ease;
  }
  .mockkit-dom-inspector__color-toggle:hover {
    background: rgb(27 40 34 / 6%);
    color: #1b2822;
  }
  .mockkit-dom-inspector__edit-input {
    width: 100%;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #1b2822;
    border: 1px solid rgb(26 155 127 / 35%);
    border-radius: 4px;
    padding: 2px 4px;
    background: rgb(255 255 255 / 90%);
    outline: none;
    line-height: 1.4;
  }
  .mockkit-dom-inspector__edit-input:focus {
    border-color: #1a9b7f;
    box-shadow: 0 0 0 2px rgb(26 155 127 / 15%);
  }
  .mockkit-dom-inspector__color-picker {
    width: 100%;
    height: 28px;
    border: 1px solid rgb(27 40 34 / 12%);
    border-radius: 5px;
    cursor: pointer;
    padding: 2px;
    background: transparent;
  }
  /* Box model diagram: Chrome DevTools-style nested boxes. */
  .mockkit-dom-inspector__box-model {
    margin-top: 10px;
    padding: 8px;
    border-radius: 8px;
    background: #f5f7f6;
  }
  .mockkit-dom-inspector__box-model-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgb(27 40 34 / 45%);
    margin-bottom: 6px;
  }
  .mockkit-dom-inspector__box-outer {
    position: relative;
    padding: 18px;
    border: 1px dashed #3b82f6;
    background: rgb(59 130 246 / 12%);
    text-align: center;
  }
  .mockkit-dom-inspector__box-margin-label {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 9px;
    color: #2563eb;
    font-family: Menlo, Monaco, Consolas, monospace;
  }
  .mockkit-dom-inspector__box-margin-val {
    position: absolute;
    font-size: 9px;
    color: #2563eb;
    font-family: Menlo, Monaco, Consolas, monospace;
  }
  .mockkit-dom-inspector__box-margin-val--top { top: 2px; left: 50%; transform: translateX(-50%); }
  .mockkit-dom-inspector__box-margin-val--bottom { bottom: 2px; left: 50%; transform: translateX(-50%); }
  .mockkit-dom-inspector__box-margin-val--left { left: 2px; top: 50%; transform: translateY(-50%); }
  .mockkit-dom-inspector__box-margin-val--right { right: 2px; top: 50%; transform: translateY(-50%); }
  .mockkit-dom-inspector__box-border {
    position: relative;
    padding: 18px;
    border: 1px solid #10b981;
    background: rgb(16 185 129 / 12%);
    text-align: center;
  }
  .mockkit-dom-inspector__box-border-label {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 9px;
    color: #059669;
    font-family: Menlo, Monaco, Consolas, monospace;
  }
  .mockkit-dom-inspector__box-border-val {
    position: absolute;
    font-size: 9px;
    color: #059669;
    font-family: Menlo, Monaco, Consolas, monospace;
  }
  .mockkit-dom-inspector__box-border-val--top { top: 2px; left: 50%; transform: translateX(-50%); }
  .mockkit-dom-inspector__box-border-val--bottom { bottom: 2px; left: 50%; transform: translateX(-50%); }
  .mockkit-dom-inspector__box-border-val--left { left: 2px; top: 50%; transform: translateY(-50%); }
  .mockkit-dom-inspector__box-border-val--right { right: 2px; top: 50%; transform: translateY(-50%); }
  .mockkit-dom-inspector__box-padding {
    position: relative;
    padding: 18px;
    border: 1px dashed #84cc16;
    background: rgb(132 204 22 / 12%);
    text-align: center;
  }
  .mockkit-dom-inspector__box-padding-label {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 9px;
    color: #65a30d;
    font-family: Menlo, Monaco, Consolas, monospace;
  }
  .mockkit-dom-inspector__box-padding-val {
    position: absolute;
    font-size: 9px;
    color: #65a30d;
    font-family: Menlo, Monaco, Consolas, monospace;
  }
  .mockkit-dom-inspector__box-padding-val--top { top: 2px; left: 50%; transform: translateX(-50%); }
  .mockkit-dom-inspector__box-padding-val--bottom { bottom: 2px; left: 50%; transform: translateX(-50%); }
  .mockkit-dom-inspector__box-padding-val--left { left: 2px; top: 50%; transform: translateY(-50%); }
  .mockkit-dom-inspector__box-padding-val--right { right: 2px; top: 50%; transform: translateY(-50%); }
  .mockkit-dom-inspector__box-content {
    padding: 10px;
    border: 1px solid #eab308;
    background: rgb(234 179 8 / 14%);
    text-align: center;
    font-size: 10px;
    color: #ca8a04;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-weight: 600;
  }
  .mockkit-dom-inspector__edit-box {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 18px;
    border: 1px solid rgb(27 40 34 / 12%);
    border-radius: 8px;
    background: rgb(128 128 128 / 12%);
    min-height: 56px;
  }
  .mockkit-dom-inspector__edit-box-input {
    width: 60px;
    text-align: center;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    font-weight: 600;
    color: #1b2822;
    border: 1px solid rgb(26 155 127 / 35%);
    border-radius: 5px;
    padding: 4px 6px;
    background: rgb(255 255 255 / 95%);
    outline: none;
  }
  .mockkit-dom-inspector__edit-box-input:focus {
    border-color: #1a9b7f;
    box-shadow: 0 0 0 2px rgb(26 155 127 / 15%);
  }
  .mockkit-dom-inspector__edit-box-x {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    font-weight: 600;
    color: rgb(27 40 34 / 45%);
  }
  .mockkit-dom-inspector__summary-swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid rgb(27 40 34 / 15%);
    vertical-align: middle;
    margin-right: 4px;
  }
  .mockkit-dom-inspector__collapse {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    user-select: none;
    padding: 6px 0;
    color: rgb(27 40 34 / 55%);
    font-size: 11px;
    font-weight: 600;
  }
  .mockkit-dom-inspector__collapse:hover {
    color: #1a9b7f;
  }
  .mockkit-dom-inspector__collapse-arrow {
    transition: transform 0.2s ease;
  }
  .mockkit-dom-inspector__collapse-arrow--open {
    transform: rotate(90deg);
  }
  .mockkit-dom-inspector__full-details {
    display: none;
  }
  .mockkit-dom-inspector__full-details--open {
    display: block;
  }

  /* ===== Mark by Class module ===== */
  /* Independent module placed below Element Box. Lets the user type a class
     name and outline every matching element on the page. Uses purple to
     stay visually distinct from inspect (green) and measure (orange). */
  .mockkit-dom-inspector__mark-module {
    border-top: 1px solid rgb(27 40 34 / 6%);
    padding: 10px 14px;
  }
  .mockkit-dom-inspector__mark-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .mockkit-dom-inspector__mark-title {
    font-size: 11px;
    font-weight: 600;
    color: #1b2822;
  }
  .mockkit-dom-inspector__mark-clear-btn {
    flex-shrink: 0;
    padding: 2px 8px;
    border: 1px solid rgb(124 58 237 / 30%);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    color: rgb(124 58 237 / 70%);
    font-size: 10px;
    font-weight: 600;
    transition: all 0.15s ease;
  }
  .mockkit-dom-inspector__mark-clear-btn:hover {
    background: rgb(124 58 237 / 10%);
    color: #7c3aed;
  }
  .mockkit-dom-inspector__mark-clear-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .mockkit-dom-inspector__mark-input-row {
    display: flex;
    gap: 6px;
  }
  .mockkit-dom-inspector__mark-input {
    flex: 1;
    min-width: 0;
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #1b2822;
    border: 1px solid rgb(124 58 237 / 30%);
    border-radius: 5px;
    padding: 4px 8px;
    background: rgb(255 255 255 / 95%);
    outline: none;
    transition: border-color 0.15s ease;
  }
  .mockkit-dom-inspector__mark-input:focus {
    border-color: #7c3aed;
    box-shadow: 0 0 0 2px rgb(124 58 237 / 15%);
  }
  .mockkit-dom-inspector__mark-btn {
    flex-shrink: 0;
    padding: 4px 12px;
    border: none;
    border-radius: 5px;
    background: #7c3aed;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .mockkit-dom-inspector__mark-btn:hover {
    background: #6d28d9;
  }
  .mockkit-dom-inspector__mark-hint {
    margin-top: 6px;
    font-size: 10px;
    line-height: 1.5;
    color: rgb(27 40 34 / 45%);
  }
  .mockkit-dom-inspector__mark-status {
    margin-top: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #7c3aed;
    min-height: 14px;
  }
  .mockkit-dom-inspector__mark-status--err {
    color: #d4380d;
  }
  /* Overlay rendered on the page for each matched element. Semi-transparent
     so the underlying element is still visible and inspectable. */
  .mockkit-dom-inspector__mark-overlay {
    position: fixed;
    z-index: 2147483645;
    pointer-events: none;
    border: 2px solid rgb(124 58 237 / 0.65);
    border-radius: 3px;
    background: rgb(124 58 237 / 0.08);
    box-shadow: 0 0 0 1px rgb(124 58 237 / 0.15);
    transition: opacity 0.15s ease;
  }
  .mockkit-dom-inspector__mark-badge {
    position: fixed;
    z-index: 2147483645;
    pointer-events: none;
    background: rgb(124 58 237 / 0.85);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    font-family: Menlo, Monaco, Consolas, monospace;
    padding: 1px 5px;
    border-radius: 3px 0 3px 0;
    line-height: 1.4;
  }
  /* Custom autocomplete dropdown (replaces native datalist so we can bind
     per-option hover for live preview). z-index matches the panel so it
     stacks above by DOM order (dropdown is appended after the panel). */
  .mockkit-dom-inspector__mark-dropdown {
    position: fixed;
    z-index: 2147483647;
    max-height: 200px;
    overflow-y: auto;
    min-width: 160px;
    border-radius: 6px;
    border: 1px solid rgb(124 58 237 / 20%);
    background: rgb(255 255 255 / 96%);
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 24px rgb(37 54 46 / 12%);
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    padding: 4px 0;
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
    transform-origin: top center;
    transition: opacity 0.18s ease, transform 0.18s ease;
  }
  .mockkit-dom-inspector__mark-dropdown--open {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  .mockkit-dom-inspector__mark-dropdown-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 10px;
    cursor: pointer;
    color: #1b2822;
    transition: background 0.1s ease;
  }
  .mockkit-dom-inspector__mark-dropdown-option:hover {
    background: rgb(124 58 237 / 10%);
  }
  .mockkit-dom-inspector__mark-dropdown-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mockkit-dom-inspector__mark-dropdown-count {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
    color: rgb(124 58 237 / 60%);
    background: rgb(124 58 237 / 8%);
    border-radius: 8px;
    padding: 1px 5px;
  }
  /* Preview overlay: dashed style to distinguish from committed marks.
     Uses background-color + transform for a more visible animation than
     opacity alone (the overlay is already very light, so opacity fade is
     hard to perceive). */
  .mockkit-dom-inspector__mark-preview {
    position: fixed;
    z-index: 2147483644;
    pointer-events: none;
    border: 2px dashed rgb(124 58 237 / 0.7);
    border-radius: 3px;
    background: rgb(124 58 237 / 0);
    opacity: 1;
    transform: scale(0.96);
    transform-origin: center;
    transition: background-color 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
  }
  .mockkit-dom-inspector__mark-preview--in {
    background: rgb(124 58 237 / 0.12);
    transform: scale(1);
  }
  .mockkit-dom-inspector__mark-preview--fade {
    background: rgb(124 58 237 / 0);
    transform: scale(0.96);
    border-color: rgb(124 58 237 / 0);
  }
`);

let domInspectorState = {
  active: false,
  // 'inspect' = pick-then-show-panel (the original flow); 'measure' =
  // anchor+hover distance measurement (no panel). Decides click behavior.
  mode: 'inspect',
  overlay: null,
  overlayLabel: null,
  boxModelOverlay: null,
  measurements: null,
  // Anchor layer: persistent blue highlight for the locked baseline element A.
  // Stays visible while the user hovers other elements to measure distance.
  anchorOverlay: null,
  // The currently anchored baseline element (null until first click).
  anchor: null,
  // The locked second element B (null until the second click). After locking,
  // the user can keep hovering to measure A against new elements.
  lockedTarget: null,
  panel: null,
  lastTarget: null,
  pendingTarget: null,
  rafId: null,
  // ----- Mark by Class state -----
  // Overlays persist on document.body independent of panel rebuilds. The
  // input value is preserved across rebuilds so the user does not lose what
  // they typed when inspecting another node.
  markOverlays: [],
  markBadges: [],
  markInputValue: '',
  markClassName: '',
  markKeyListener: null,
  markRepositionFrame: null,
  markDatalistBuilt: false,
  // ----- Hover preview state -----
  // Transient overlays shown when the user hovers a class name in the
  // autocomplete dropdown. Distinct from committed marks (markOverlays):
  // preview uses dashed border + fade animation; marks use solid border.
  markPreviewOverlays: [],
  markPreviewClassName: '',
  markDropdown: null,
  markClassList: [],
  // ----- Picked-node box-model overlay -----
  // Persistent box-model highlight for the node picked in inspect mode. Created
  // in showDomInspectorPanel (when a node is chosen) and removed when the
  // panel closes. Distinct from the transient hover boxModelOverlay in
  // createDomInspectorOverlay (which only shows while hovering).
  pickedMarginOverlay: null,
  pickedNode: null,
  pickedRepositionFrame: null,
  pickedListenersBound: false,
};

// Create an empty box-model overlay element with the full layer structure:
// margin layer (fills container) + border/padding/content layers + 8 value
// labels (margin T/R/B/L blue, padding T/R/B/L green). Children are nested
// absolutely inside the container (= margin box). Returns the container with
// a _boxModel handle attached for updateBoxModelOverlay to mutate in place
// (zero DOM creation/deletion per frame).
function createBoxModelOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'mockkit-box-model-overlay';
  const marginLayer = document.createElement('div');
  marginLayer.className = 'mockkit-box-model-overlay__margin';
  overlay.appendChild(marginLayer);
  const borderLayer = document.createElement('div');
  borderLayer.className = 'mockkit-box-model-overlay__border';
  overlay.appendChild(borderLayer);
  const paddingLayer = document.createElement('div');
  paddingLayer.className = 'mockkit-box-model-overlay__padding';
  overlay.appendChild(paddingLayer);
  const contentLayer = document.createElement('div');
  contentLayer.className = 'mockkit-box-model-overlay__content';
  overlay.appendChild(contentLayer);
  const labels = {};
  const keys = [
    ['mt', 'margin'], ['mr', 'margin'], ['mb', 'margin'], ['ml', 'margin'],
    ['pt', 'padding'], ['pr', 'padding'], ['pb', 'padding'], ['pl', 'padding'],
  ];
  keys.forEach(([k, kind]) => {
    const el = document.createElement('div');
    el.className = `mockkit-box-model-overlay__label mockkit-box-model-overlay__label--${kind}`;
    overlay.appendChild(el);
    labels[k] = el;
  });
  overlay._boxModel = { marginLayer, borderLayer, paddingLayer, contentLayer, labels };
  return overlay;
}

// Update an existing box-model overlay (built by createBoxModelOverlay) to
// reflect a target element's current box. Only mutates style + textContent —
// no DOM creation/deletion — so it is cheap to call every frame in renderFrame.
// Appending to <html> is the caller's responsibility (avoids <body> stacking
// contexts). Margins of 0 still render (label dimmed) so the user can confirm
// "this side is 0" rather than wondering if a label is missing.
function updateBoxModelOverlay(overlay, target) {
  const bm = overlay._boxModel;
  if (!bm || !target || !target.isConnected) return false;
  const cs = window.getComputedStyle(target);
  const num = (v) => parseFloat(v) || 0;
  const m = { t: num(cs.marginTop), r: num(cs.marginRight), b: num(cs.marginBottom), l: num(cs.marginLeft) };
  const bd = { t: num(cs.borderTopWidth), r: num(cs.borderRightWidth), b: num(cs.borderBottomWidth), l: num(cs.borderLeftWidth) };
  const p = { t: num(cs.paddingTop), r: num(cs.paddingRight), b: num(cs.paddingBottom), l: num(cs.paddingLeft) };
  const rect = target.getBoundingClientRect(); // border box
  if (rect.width <= 0 && rect.height <= 0) return false;
  // Container = margin box.
  overlay.style.left = `${rect.left - m.l}px`;
  overlay.style.top = `${rect.top - m.t}px`;
  overlay.style.width = `${rect.width + m.l + m.r}px`;
  overlay.style.height = `${rect.height + m.t + m.b}px`;
  // Border layer = border box, inset by margins.
  bm.borderLayer.style.left = `${m.l}px`;
  bm.borderLayer.style.top = `${m.t}px`;
  bm.borderLayer.style.width = `${rect.width}px`;
  bm.borderLayer.style.height = `${rect.height}px`;
  // Padding layer = padding box, inset by borders.
  const padW = Math.max(0, rect.width - bd.l - bd.r);
  const padH = Math.max(0, rect.height - bd.t - bd.b);
  bm.paddingLayer.style.left = `${m.l + bd.l}px`;
  bm.paddingLayer.style.top = `${m.t + bd.t}px`;
  bm.paddingLayer.style.width = `${padW}px`;
  bm.paddingLayer.style.height = `${padH}px`;
  // Content layer = content box, inset by padding.
  const contW = Math.max(0, padW - p.l - p.r);
  const contH = Math.max(0, padH - p.t - p.b);
  bm.contentLayer.style.left = `${m.l + bd.l + p.l}px`;
  bm.contentLayer.style.top = `${m.t + bd.t + p.t}px`;
  bm.contentLayer.style.width = `${contW}px`;
  bm.contentLayer.style.height = `${contH}px`;
  // Value labels. Positioned OUTSIDE the overlay's outer (margin) edge so
  // they never overlap any color region (margin/border/padding/content).
  // Each badge sits 4px beyond the margin box, anchored to its edge midpoint
  // via translate(-50%,-50%). Color (blue=margin, green=padding) tells the
  // user which region the value belongs to. Margin badges use the outer edge
  // midpoint; padding badges use the border-box edge midpoint projected
  // outward — visually "pointing" at the padding ring without entering it.
  const setLabel = (el, val, x, y) => {
    el.textContent = `${val}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.classList.toggle('mockkit-box-model-overlay__label--zero', val === 0);
  };
  // Badge half-size budget. Badges are ~18px tall / ~22px wide with padding;
  // translate(-50%,-50%) centers them on (x,y), so the badge extends ~9px in
  // each direction from that anchor. To keep the badge fully outside the
  // margin box (no overlap with any color region), the anchor must sit at
  // least half the badge size beyond the margin edge. 12px gives margin.
  const BADGE_GAP = 12;
  // Outer box (margin box) rect — badges live outside this.
  const mLeft = 0;
  const mTop = 0;
  const mRight = rect.width + m.l + m.r;
  const mBottom = rect.height + m.t + m.b;
  // Border-box rect (inside margin box), used as the projection origin for
  // padding badges so they visually associate with the padding ring.
  const bLeft = m.l;
  const bTop = m.t;
  const bRight = m.l + rect.width;
  const bBottom = m.t + rect.height;
  // Margin badges: outer edge midpoints, pushed outside the margin box.
  setLabel(bm.labels.mt, m.t, mRight / 2, mTop - BADGE_GAP);
  setLabel(bm.labels.mr, m.r, mRight + BADGE_GAP, mBottom / 2);
  setLabel(bm.labels.mb, m.b, mRight / 2, mBottom + BADGE_GAP);
  setLabel(bm.labels.ml, m.l, mLeft - BADGE_GAP, mBottom / 2);
  // Padding badges: border-box edge midpoints, pushed outside the margin box
  // along the same axis. Horizontally aligned with the border edge (so the
  // badge visually points at the padding ring), vertically on the border
  // midpoint row, but shifted out beyond the margin box.
  setLabel(bm.labels.pt, p.t, bLeft + rect.width / 2, mTop - BADGE_GAP);
  setLabel(bm.labels.pr, p.r, mRight + BADGE_GAP, bTop + rect.height / 2);
  setLabel(bm.labels.pb, p.b, bLeft + rect.width / 2, mBottom + BADGE_GAP);
  setLabel(bm.labels.pl, p.l, mLeft - BADGE_GAP, bTop + rect.height / 2);
  return true;
}

function createDomInspectorOverlay() {
  if (domInspectorState.overlay) return domInspectorState.overlay;
  const overlay = document.createElement('div');
  overlay.className = 'mockkit-dom-inspector-overlay';
  document.body.appendChild(overlay);
  domInspectorState.overlay = overlay;

  // Box-model overlay: full margin/border/padding/content stack with value
  // badges, shown while hovering in inspect mode (and locked as the picked
  // overlay on click). Built once here and updated in place by renderFrame
  // via updateBoxModelOverlay (zero DOM churn per frame). Appended to <html>
  // so page stacking contexts on <body> can't trap it.
  const boxModelOverlay = createBoxModelOverlay();
  (document.documentElement || document.body).appendChild(boxModelOverlay);
  domInspectorState.boxModelOverlay = boxModelOverlay;

  // Info label that floats next to the highlight box, showing the element's
  // selector + size — mirrors the Chrome DevTools inspect behavior.
  const label = document.createElement('div');
  label.className = 'mockkit-dom-inspector-overlay__label';
  document.body.appendChild(label);
  domInspectorState.overlayLabel = label;

  // Figma-style measurement guides container. Children (lines + labels) are
  // created on demand in drawMeasurements().
  const measurements = document.createElement('div');
  measurements.className = 'mockkit-dom-inspector-measurements';
  document.body.appendChild(measurements);
  domInspectorState.measurements = measurements;

  // Anchor highlight layer (blue). Created once, shown/hidden as the anchor
  // is set/cleared. Separate from the green hover overlay so both can be
  // visible simultaneously (anchor A + hovered element B).
  const anchorOverlay = document.createElement('div');
  anchorOverlay.className = 'mockkit-dom-inspector-anchor-overlay';
  document.body.appendChild(anchorOverlay);
  domInspectorState.anchorOverlay = anchorOverlay;

  return overlay;
}

function destroyDomInspectorOverlay() {
  if (domInspectorState.overlay) {
    domInspectorState.overlay.remove();
    domInspectorState.overlay = null;
  }
  if (domInspectorState.boxModelOverlay) {
    domInspectorState.boxModelOverlay.remove();
    domInspectorState.boxModelOverlay = null;
  }
  if (domInspectorState.overlayLabel) {
    domInspectorState.overlayLabel.remove();
    domInspectorState.overlayLabel = null;
  }
  if (domInspectorState.measurements) {
    domInspectorState.measurements.remove();
    domInspectorState.measurements = null;
  }
  if (domInspectorState.anchorOverlay) {
    domInspectorState.anchorOverlay.remove();
    domInspectorState.anchorOverlay = null;
  }
}

// Compute the measurement between the anchored baseline A and the hovered
// element B. Unlike the old auto-guess algorithm, both endpoints are chosen
// by the user, so this is pure two-rect geometry — no candidate collection,
// no pruning, no viewport fallback.
//
// Rendering rules (kept simple and predictable):
//  - If A and B overlap on the horizontal axis, only the vertical gap matters:
//    draw one vertical line + a single pixel value (the vertical distance).
//  - If they overlap on the vertical axis, draw one horizontal line + value.
//  - If they overlap on BOTH axes (one contains the other, or a true overlap),
//    there is no gap to measure — return null so the caller hides guides.
//  - If they overlap on NEITHER axis (diagonal), draw a center-to-center
//    connector line and label both Δx and Δy so the user sees both deltas.
function computeAnchorMeasurement(anchor, target) {
  if (!anchor || !target || anchor === target) return null;
  const a = anchor.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return null;

  // Horizontal overlap: A and B share some x-range.
  const hOverlap = b.right > a.left && b.left < a.right;
  // Vertical overlap: A and B share some y-range.
  const vOverlap = b.bottom > a.top && b.top < a.bottom;

  // Both axes overlap → no gap to measure (nested or intersecting).
  if (hOverlap && vOverlap) return null;

  if (hOverlap) {
    // Only vertical gap. Draw a vertical line at the shared horizontal center.
    const cx = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    if (b.bottom <= a.top) {
      // B is above A.
      const dist = Math.round(a.top - b.bottom);
      return { type: 'vertical', x: cx, top: b.bottom, height: a.top - b.bottom, label: `${dist}` };
    }
    // B is below A.
    const dist = Math.round(b.top - a.bottom);
    return { type: 'vertical', x: cx, top: a.bottom, height: b.top - a.bottom, label: `${dist}` };
  }

  if (vOverlap) {
    // Only horizontal gap. Draw a horizontal line at the shared vertical center.
    const cy = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    if (b.right <= a.left) {
      // B is left of A.
      const dist = Math.round(a.left - b.right);
      return { type: 'horizontal', y: cy, left: b.right, width: a.left - b.right, label: `${dist}` };
    }
    // B is right of A.
    const dist = Math.round(b.left - a.right);
    return { type: 'horizontal', y: cy, left: a.right, width: b.left - a.right, label: `${dist}` };
  }

  // Diagonal: no axis overlap. Represent the empty space between A and B as a
  // single semi-transparent rect whose width = horizontal gap and height =
  // vertical gap. This is more intuitive than two separate lines because it
  // shows the actual blank region the two elements enclose, at a glance.
  // Label is "h × v" centered inside the rect (mirrors the hover label's
  // "W×H" convention). We use nearest edges (not centers) so the rect bounds
  // exactly the gap between the two elements.
  const hDist = b.left >= a.right ? b.left - a.right : a.left - b.right;
  const vDist = b.top >= a.bottom ? b.top - a.bottom : a.top - b.bottom;
  // Rect corners: the nearest vertical edge of each element on x, the nearest
  // horizontal edge of each on y.
  const rectLeft = b.left >= a.right ? a.right : b.right;
  const rectTop = b.top >= a.bottom ? a.bottom : b.bottom;
  return {
    type: 'diagonal',
    rect: {
      left: rectLeft,
      top: rectTop,
      width: hDist,
      height: vDist,
    },
    label: `${Math.round(hDist)} × ${Math.round(vDist)}`,
  };
}

// Render the measurement guide between the anchor and the hovered target.
// Called once per animation frame; clears the container and redraws a single
// guide (vertical / horizontal / diagonal) based on computeAnchorMeasurement.
function drawMeasurements(measurements, data) {
  // Fast path: clear previous guides.
  measurements.innerHTML = '';
  if (!data) return;

  const createLine = (style) => {
    const line = document.createElement('div');
    line.className = 'mockkit-dom-inspector-measurements__line';
    Object.assign(line.style, style);
    return line;
  };
  const createLabel = (text, left, top) => {
    const label = document.createElement('div');
    label.className = 'mockkit-dom-inspector-measurements__label';
    label.textContent = text;
    label.style.left = `${left}px`;
    label.style.top = `${top}px`;
    return label;
  };

  if (data.type === 'vertical') {
    // 1px-wide vertical line spanning the gap.
    measurements.appendChild(createLine({
      left: `${data.x}px`,
      top: `${data.top}px`,
      width: '1px',
      height: `${Math.max(data.height, 0)}px`,
    }));
    measurements.appendChild(createLabel(
      data.label,
      data.x + 4,
      data.top + data.height / 2 - 8
    ));
  } else if (data.type === 'horizontal') {
    // 1px-tall horizontal line spanning the gap.
    measurements.appendChild(createLine({
      left: `${data.left}px`,
      top: `${data.y}px`,
      width: `${Math.max(data.width, 0)}px`,
      height: '1px',
    }));
    measurements.appendChild(createLabel(
      data.label,
      data.left + data.width / 2 - 12,
      data.y + 4
    ));
  } else if (data.type === 'diagonal') {
    // Diagonal case: render the blank region between A and B as a single
    // semi-transparent rect. Its width = horizontal gap, height = vertical
    // gap, so the user sees the actual empty space the two elements enclose.
    const r = data.rect;
    const rectEl = document.createElement('div');
    rectEl.className = 'mockkit-dom-inspector-measurements__rect';
    rectEl.style.left = `${r.left}px`;
    rectEl.style.top = `${r.top}px`;
    rectEl.style.width = `${Math.max(r.width, 0)}px`;
    rectEl.style.height = `${Math.max(r.height, 0)}px`;
    measurements.appendChild(rectEl);
    // Center the "h × v" label inside the rect. If the rect is too small to
    // hold the label, place it just outside the rect's bottom-right corner so
    // it stays readable.
    const labelW = data.label.length * 6 + 10;
    const labelH = 16;
    const inside = r.width >= labelW && r.height >= labelH;
    measurements.appendChild(createLabel(
      data.label,
      inside ? r.left + (r.width - labelW) / 2 : r.left + r.width + 4,
      inside ? r.top + (r.height - labelH) / 2 : r.top + r.height + 2
    ));
  }
}

function startDomInspector(opts) {
  if (domInspectorState.active) return;
  domInspectorState.active = true;
  // 'inspect' = pick a node then show the detail panel (original flow);
  // 'measure' = anchor+hover distance measurement (no panel). The measure
  // entry button passes { mode: 'measure' }; the inspect button and the
  // iframe DOM Inspect button use the default 'inspect'.
  domInspectorState.mode = opts?.mode === 'measure' ? 'measure' : 'inspect';
  createDomInspectorOverlay();

  // Hover-overlay color is mode-aware so the user can tell inspect vs measure
  // apart at a glance: green border for inspect, orange for measure (distinct
  // from the blue anchor A and red measurement guides used in measure mode).
  const isMeasureMode = domInspectorState.mode === 'measure';
  if (domInspectorState.overlay) {
    domInspectorState.overlay.classList.toggle('mockkit-dom-inspector-overlay--measure', isMeasureMode);
  }
  if (domInspectorState.overlayLabel) {
    domInspectorState.overlayLabel.classList.toggle('mockkit-dom-inspector-overlay__label--measure', isMeasureMode);
  }

  // Sync every entry button's active indicator (inspect = green, measure =
  // red). Done via class query, not a held ref, so it survives panel rebuilds.
  syncInspectorEntryButtons();

  // Position the persistent anchor (blue) overlay over the anchored element A.
  // Called whenever the anchor is set or replaced so the blue box tracks A.
  const updateAnchorOverlay = () => {
    const anchorOverlay = domInspectorState.anchorOverlay;
    const anchor = domInspectorState.anchor;
    if (!anchorOverlay || !anchor) {
      if (anchorOverlay) anchorOverlay.style.display = 'none';
      return;
    }
    const r = anchor.getBoundingClientRect();
    anchorOverlay.style.left = `${r.left}px`;
    anchorOverlay.style.top = `${r.top}px`;
    anchorOverlay.style.width = `${r.width}px`;
    anchorOverlay.style.height = `${r.height}px`;
    anchorOverlay.style.display = 'block';
  };

  // mousemove only stashes the latest target and schedules a single rAF; all
  // DOM mutation (highlight + label + measurements) happens in renderFrame so
  // a burst of moves collapses into one layout pass.
  const onMove = (event) => {
    if (!domInspectorState.active) return;
    const overlay = domInspectorState.overlay;
    if (overlay) overlay.style.display = 'none';
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (overlay) overlay.style.display = 'block';
    if (!target || target === domInspectorState.panel) return;

    domInspectorState.pendingTarget = target;
    if (domInspectorState.rafId == null) {
      domInspectorState.rafId = requestAnimationFrame(renderFrame);
    }
  };

  // Single frame renderer: reads pendingTarget, draws the green hover
  // highlight + label, keeps the blue anchor overlay in sync, then — when an
  // anchor is set — computes and draws the measurement guide from the anchor
  // to the currently hovered element.
  const renderFrame = () => {
    domInspectorState.rafId = null;
    const target = domInspectorState.pendingTarget;
    if (!target) return;
    domInspectorState.lastTarget = target;

    // Keep the anchor overlay tracking A (A may have shifted on scroll/resize).
    updateAnchorOverlay();

    const rect = target.getBoundingClientRect();
    const overlay = domInspectorState.overlay;
    if (overlay) {
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.display = 'block';
    }
    const label = domInspectorState.overlayLabel;
    if (label) {
      const { tag, id, classes } = describeDomNode(target);
      const shortSelector = `${tag}${id ? `#${id}` : ''}${classes.length ? `.${classes[0]}` : ''}`;
      label.textContent = `${shortSelector}  ${Math.round(rect.width)}×${Math.round(rect.height)}`;
      const labelTop = rect.top > 20 ? rect.top - 20 : rect.bottom + 4;
      label.style.left = `${rect.left}px`;
      label.style.top = `${labelTop}px`;
      label.style.display = 'block';
    }

    // Box-model overlay (inspect mode only): update the full margin/border/
    // padding/content stack + 8 value badges for the hovered target. Hidden
    // in measure mode (which has its own overlay semantics). Built once in
    // createDomInspectorOverlay; updated in place here — zero DOM churn.
    const boxModelOverlay = domInspectorState.boxModelOverlay;
    if (boxModelOverlay) {
      if (domInspectorState.mode === 'inspect') {
        const shown = updateBoxModelOverlay(boxModelOverlay, target);
        boxModelOverlay.style.display = shown ? 'block' : 'none';
      } else {
        boxModelOverlay.style.display = 'none';
      }
    }

    // Measurement guides only when an anchor is set. Skip the hovered element
    // itself (no distance to self) and skip rotated elements whose visual
    // rect is not axis-aligned (straight guides would be misleading).
    const measurements = domInspectorState.measurements;
    const anchor = domInspectorState.anchor;
    if (measurements && anchor && anchor !== target) {
      const data = computeAnchorMeasurement(anchor, target);
      drawMeasurements(measurements, data);
      measurements.style.display = 'block';
    } else if (measurements) {
      // No anchor yet, or hovering the anchor itself: hide guides.
      measurements.innerHTML = '';
      measurements.style.display = 'none';
    }
  };

  // Click behavior depends on the mode:
  //  - inspect: pick the node, show the detail panel, then exit (one-shot).
  //  - measure: drive the anchor state machine (first click anchors A,
  //    second locks B, third replaces A; Esc exits).
  const onClick = (event) => {
    if (!domInspectorState.active) return;
    if (domInspectorState.panel && domInspectorState.panel.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = domInspectorState.lastTarget || event.target;
    if (!target || target === domInspectorState.panel) return;

    // Inspect mode: original pick-and-show-panel flow. One click, then exit.
    if (domInspectorState.mode !== 'measure') {
      pickDomNode(target);
      stopDomInspector();
      return;
    }

    // Measure mode: anchor state machine.
    if (!domInspectorState.anchor) {
      // First click: anchor the baseline element A.
      domInspectorState.anchor = target;
      domInspectorState.lockedTarget = null;
      updateAnchorOverlay();
      showDomInspectorPanel(null, '已锚定基准元素（蓝框）。移动鼠标查看距离，点击锁定或换基准。Esc 退出。');
      return;
    }

    if (target === domInspectorState.anchor) {
      // Clicking the anchor again just keeps it; ignore so the user can lock
      // on A itself without accidentally clearing.
      return;
    }

    if (!domInspectorState.lockedTarget) {
      // Second click: lock B. Measurement to B stays visible until the next
      // hover moves away. Prompt for continued exploration.
      domInspectorState.lockedTarget = target;
      showDomInspectorPanel(null, '已锁定目标元素。继续 hover 测其他元素，点击新元素换基准，Esc 退出。');
      return;
    }

    // Third+ click: replace the anchor with the clicked element so the user
    // can start a fresh measurement pair without re-entering the mode.
    domInspectorState.anchor = target;
    domInspectorState.lockedTarget = null;
    updateAnchorOverlay();
    showDomInspectorPanel(null, '已换为新基准（蓝框）。移动鼠标查看距离，点击锁定或换基准。Esc 退出。');
  };

  const onKey = (event) => {
    if (event.key === 'Escape') {
      stopDomInspector();
    }
  };

  domInspectorState.onMove = onMove;
  domInspectorState.onClick = onClick;
  domInspectorState.onKey = onKey;

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);

  // Entry prompt differs by mode so the user knows which flow they're in.
  if (domInspectorState.mode === 'measure') {
    showDomInspectorPanel(null, '点击第一个元素作为基准，再 hover 其他元素查看距离。Esc 退出。');
  } else {
    showDomInspectorPanel(null, 'Move your mouse over the page and click a node to inspect. Press Esc to cancel.');
  }
}

function stopDomInspector() {
  if (!domInspectorState.active) return;
  domInspectorState.active = false;
  // Cancel any pending frame so we never draw after teardown.
  if (domInspectorState.rafId != null) {
    cancelAnimationFrame(domInspectorState.rafId);
    domInspectorState.rafId = null;
  }
  domInspectorState.pendingTarget = null;
  // Clear the anchor/locked state so the next inspect session starts fresh.
  domInspectorState.anchor = null;
  domInspectorState.lockedTarget = null;
  domInspectorState.mode = 'inspect';
  // Clear all entry-button active indicators. Uses class query so it works
  // even if the DOM Inspector panel was rebuilt since the last start.
  syncInspectorEntryButtons();
  if (domInspectorState.onMove) document.removeEventListener('mousemove', domInspectorState.onMove, true);
  if (domInspectorState.onClick) document.removeEventListener('click', domInspectorState.onClick, true);
  if (domInspectorState.onKey) document.removeEventListener('keydown', domInspectorState.onKey, true);
  destroyDomInspectorOverlay();
}

// Sync every inspector entry button's active indicator to the current
// domInspectorState. Queries by class (not by a held reference) so it stays
// correct even after the DOM Inspector panel is destroyed/rebuilt — the old
// single-ref approach lost sync when showDomInspectorPanel re-created the
// header buttons. Inspect = green solid, measure = red solid + pulse.
function syncInspectorEntryButtons() {
  const inspectOn = domInspectorState.active && domInspectorState.mode === 'inspect';
  const measureOn = domInspectorState.active && domInspectorState.mode === 'measure';
  document.querySelectorAll('.mockkit-floating-rules__inspect-btn')
    .forEach((b) => {
      b.classList.toggle('mockkit-floating-rules__inspect-btn--on', inspectOn);
      b.title = inspectOn ? 'Inspecting — click a node, Esc to cancel' : 'Inspect a DOM node';
    });
  document.querySelectorAll('.mockkit-dom-inspector__reinspect')
    .forEach((b) => {
      b.classList.toggle('mockkit-dom-inspector__reinspect--on', inspectOn);
      b.title = inspectOn ? 'Inspecting — click a node, Esc to cancel' : 'Inspect another element';
    });
  document.querySelectorAll('.mockkit-dom-inspector__measure-btn')
    .forEach((b) => {
      b.classList.toggle('mockkit-dom-inspector__measure-btn--on', measureOn);
      b.title = measureOn ? '测距已开启，点击关闭' : 'Measure distance between two elements';
    });
}

function describeDomNode(node) {
  if (!node) return { tag: '', id: '', classes: [] };
  const tag = node.tagName ? node.tagName.toLowerCase() : '';
  const id = node.id || '';
  const classes = node.className && typeof node.className === 'string'
    ? node.className.split(/\s+/).filter(Boolean)
    : [];
  return { tag, id, classes };
}

function readComputedStyles(node) {
  if (!node || !window.getComputedStyle) return '';
  const computed = window.getComputedStyle(node);
  // Collect the most useful properties for quick debugging.
  const keys = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'padding', 'border', 'border-radius', 'box-sizing',
    'flex', 'flex-direction', 'align-items', 'justify-content', 'gap', 'grid-template-columns',
    'color', 'background', 'background-color', 'font-size', 'font-weight', 'line-height', 'text-align',
    'opacity', 'visibility', 'overflow', 'cursor', 'transform', 'transition', 'box-shadow',
  ];
  const lines = [];
  for (const key of keys) {
    const value = computed.getPropertyValue(key);
    if (value) {
      lines.push(`<span class="mockkit-dom-inspector__prop-key">${key}</span>: <span class="mockkit-dom-inspector__prop-val">${value}</span>`);
    }
  }
  return lines.join('\n');
}

// Read only the core properties for the always-visible summary grid.
function readCoreStyles(node) {
  if (!node || !window.getComputedStyle) return null;
  const cs = window.getComputedStyle(node);
  const get = (k) => cs.getPropertyValue(k) || '';
  return {
    width: get('width'),
    height: get('height'),
    color: get('color'),
    backgroundColor: get('background-color'),
    borderWidth: get('border-width'),
    borderColor: get('border-color'),
    borderRadius: get('border-radius'),
    fontWeight: get('font-weight'),
  };
}

// Read margin/padding/border for the box model diagram (Chrome DevTools style).
function readBoxModel(node) {
  if (!node || !window.getComputedStyle) return null;
  const cs = window.getComputedStyle(node);
  const num = (k) => {
    const v = cs.getPropertyValue(k);
    const m = v.match(/([\d.]+)/);
    return m ? Math.round(parseFloat(m[1])) : 0;
  };
  const rect = node.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    margin: { top: num('margin-top'), right: num('margin-right'), bottom: num('margin-bottom'), left: num('margin-left') },
    border: { top: num('border-top-width'), right: num('border-right-width'), bottom: num('border-bottom-width'), left: num('border-left-width') },
    padding: { top: num('padding-top'), right: num('padding-right'), bottom: num('padding-bottom'), left: num('padding-left') },
  };
}

// Convert rgb(r, g, b) / rgba(r, g, b, a) to #rrggbb.
function rgbToHex(rgb) {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return rgb;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

// Convert #rrggbb to rgb(r, g, b).
function hexToRgb(hex) {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}

// Format a color value: if it looks like rgb/rgba, convert to hex (or vice
// versa). Non-color values are returned as-is.
function formatColor(value, mode) {
  if (!value) return value;
  if (mode === 'hex') {
    return rgbToHex(value);
  }
  return value; // rgb mode — return as-is (getComputedStyle already returns rgb)
}

// Map summary labels to the CSS property name on element.style for live editing.
// Only color properties and Size get editors; Border Width / Radius / Weight are display-only.
const SUMMARY_STYLE_MAP = {
  'Color': 'color',
  'Background': 'backgroundColor',
  'Font Weight': 'fontWeight',
  'Size': '', // handled specially (width × height)
};

// Build a single Core Styles table row: label cell + value cell.
// The value cell carries the click-to-copy display AND the inline editor
// (native color picker for colors, text input for other properties).
// Edits apply live to the inspected node's inline style.
function buildSummaryItem(label, value, swatchColor, colorMode, node) {
  const row = document.createElement('tr');
  row.className = 'mockkit-dom-inspector__core-row';

  const labelCell = document.createElement('td');
  labelCell.className = 'mockkit-dom-inspector__core-cell mockkit-dom-inspector__core-cell--label';
  labelCell.textContent = label;
  row.appendChild(labelCell);

  const valueCell = document.createElement('td');
  valueCell.className = 'mockkit-dom-inspector__core-cell mockkit-dom-inspector__core-cell--value';

  const isColor = Boolean(swatchColor);
  const displayValue = isColor ? formatColor(value, colorMode) : value;

  // --- Value display (click to copy with success icon) ---
  const valueEl = document.createElement('span');
  valueEl.className = 'mockkit-dom-inspector__summary-value mockkit-dom-inspector__summary-value--copyable';

  if (swatchColor) {
    const swatch = document.createElement('span');
    swatch.className = 'mockkit-dom-inspector__summary-swatch';
    swatch.style.background = swatchColor;
    valueEl.appendChild(swatch);
  }
  const textNode = document.createTextNode(displayValue);
  valueEl.appendChild(textNode);

  // Copy icon (shown briefly after successful copy).
  const copyIcon = document.createElement('span');
  copyIcon.className = 'mockkit-dom-inspector__copy-icon';
  copyIcon.textContent = '✓';
  copyIcon.style.cssText = 'display:none;margin-left:4px;color:#1a9b7f;font-weight:bold;';
  valueEl.appendChild(copyIcon);

  // Click value to copy.
  valueEl.addEventListener('click', () => {
    const copyText = isColor ? formatColor(value, colorMode) : value;
    navigator.clipboard?.writeText(copyText).then(() => {
      copyIcon.style.display = 'inline';
      valueEl.classList.add('mockkit-dom-inspector__summary-value--copied');
      setTimeout(() => {
        copyIcon.style.display = 'none';
        valueEl.classList.remove('mockkit-dom-inspector__summary-value--copied');
      }, 1200);
    }).catch(() => {});
  });
  valueCell.appendChild(valueEl);

  // --- Inline editor (below the value, inside the value cell) ---
  if (node && SUMMARY_STYLE_MAP[label] !== undefined) {
    const editorRow = document.createElement('div');
    editorRow.className = 'mockkit-dom-inspector__core-editor';

    if (isColor) {
      // Native color picker for color values.
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.className = 'mockkit-dom-inspector__color-picker';
      const hexVal = rgbToHex(value);
      picker.value = hexVal.startsWith('#') ? hexVal : '#000000';
      picker.addEventListener('input', () => {
        const styleProp = SUMMARY_STYLE_MAP[label];
        if (styleProp && node) {
          node.style[styleProp] = picker.value;
        }
        // Update swatch + text live.
        if (swatchColor) {
          const sw = valueEl.querySelector('.mockkit-dom-inspector__summary-swatch');
          if (sw) sw.style.background = picker.value;
        }
        textNode.textContent = formatColor(hexToRgb(picker.value), colorMode);
      });
      editorRow.appendChild(picker);
    } else if (label === 'Size') {
      // Width + Height dual input.
      const wMatch = String(value).match(/([\d.]+)\s*px/);
      const wInput = document.createElement('input');
      wInput.type = 'text';
      wInput.className = 'mockkit-dom-inspector__edit-input';
      wInput.placeholder = 'width';
      wInput.value = node ? (node.style.width || '') : '';
      wInput.style.cssText = 'width:48%;margin-right:4%;display:inline-block;';
      const hInput = document.createElement('input');
      hInput.type = 'text';
      hInput.className = 'mockkit-dom-inspector__edit-input';
      hInput.placeholder = 'height';
      hInput.value = node ? (node.style.height || '') : '';
      hInput.style.cssText = 'width:48%;display:inline-block;';
      wInput.addEventListener('input', () => {
        if (!node) return;
        // Auto-append px when the user types a bare number (e.g. "120" -> "120px").
        // Values that already contain a unit (%, vh, em, etc.) are passed through as-is.
        const raw = wInput.value.trim();
        if (/^\d+(\.\d+)?$/.test(raw)) {
          node.style.width = `${raw}px`;
        } else {
          node.style.width = raw;
        }
      });
      hInput.addEventListener('input', () => {
        if (!node) return;
        const raw = hInput.value.trim();
        if (/^\d+(\.\d+)?$/.test(raw)) {
          node.style.height = `${raw}px`;
        } else {
          node.style.height = raw;
        }
      });
      editorRow.appendChild(wInput);
      editorRow.appendChild(hInput);
    } else {
      // Generic text input for border, etc.
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'mockkit-dom-inspector__edit-input';
      input.value = node ? (node.style[SUMMARY_STYLE_MAP[label]] || '') : '';
      input.addEventListener('input', () => {
        const styleProp = SUMMARY_STYLE_MAP[label];
        if (styleProp && node) {
          node.style[styleProp] = input.value;
        }
      });
      editorRow.appendChild(input);
    }

    valueCell.appendChild(editorRow);
  }

  row.appendChild(valueCell);
  return row;
}

// Build a Chrome DevTools-style box model diagram with nested margin /
// border / padding / content layers and dimension labels.
// Build a single editable element box showing width × height with the
// element's background color applied. Width and height are editable inputs
// that apply live to the node's inline style.
function buildEditableBox(node, bgColor) {
  const wrap = document.createElement('div');
  wrap.className = 'mockkit-dom-inspector__box-model';

  const title = document.createElement('div');
  title.className = 'mockkit-dom-inspector__box-model-title';
  title.textContent = 'Element Box';
  wrap.appendChild(title);

  const box = document.createElement('div');
  box.className = 'mockkit-dom-inspector__edit-box';

  // Apply the element's background color so the box visually matches. Skip
  // transparent/rgba(0,0,0,0) so the default gray panel shows through.
  if (bgColor && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bgColor) && bgColor !== 'transparent') {
    box.style.background = bgColor;
  }

  const rect = node.getBoundingClientRect();
  const wInput = document.createElement('input');
  wInput.type = 'text';
  wInput.className = 'mockkit-dom-inspector__edit-box-input';
  wInput.value = node ? (node.style.width || `${Math.round(rect.width)}px`) : '';
  wInput.placeholder = 'width';
  wInput.title = 'Edit width (pure numbers auto-append px)';

  const xLabel = document.createElement('span');
  xLabel.className = 'mockkit-dom-inspector__edit-box-x';
  xLabel.textContent = '×';

  const hInput = document.createElement('input');
  hInput.type = 'text';
  hInput.className = 'mockkit-dom-inspector__edit-box-input';
  hInput.value = node ? (node.style.height || `${Math.round(rect.height)}px`) : '';
  hInput.placeholder = 'height';
  hInput.title = 'Edit height (pure numbers auto-append px)';

  const applySize = (input, prop) => {
    if (!node) return;
    const raw = input.value.trim();
    if (/^\d+(\.\d+)?$/.test(raw)) {
      node.style[prop] = `${raw}px`;
    } else {
      node.style[prop] = raw;
    }
  };
  wInput.addEventListener('input', () => applySize(wInput, 'width'));
  hInput.addEventListener('input', () => applySize(hInput, 'height'));

  box.appendChild(wInput);
  box.appendChild(xLabel);
  box.appendChild(hInput);
  wrap.appendChild(box);
  return wrap;
}

// ===== Mark by Class =====
// Independent module: type a class name, every matching element on the page
// gets a purple outline + numbered badge. ESC or the Clear button removes
// all marks. Overlays live on document.body (not inside the inspector panel)
// so they survive panel rebuilds; state is kept in domInspectorState.

// Remove every mark overlay + badge and detach listeners. Safe to call when
// no marks exist (no-op).
function clearClassMarks() {
  domInspectorState.markOverlays.forEach((el) => el.remove());
  domInspectorState.markBadges.forEach((el) => el.remove());
  domInspectorState.markOverlays = [];
  domInspectorState.markBadges = [];

  // Detach the dedicated ESC listener once marks are gone.
  if (domInspectorState.markKeyListener) {
    document.removeEventListener('keydown', domInspectorState.markKeyListener, true);
    domInspectorState.markKeyListener = null;
  }

  // Detach scroll/resize reposition listeners.
  if (domInspectorState.markRepositionFrame) {
    cancelAnimationFrame(domInspectorState.markRepositionFrame);
    domInspectorState.markRepositionFrame = null;
  }
  document.removeEventListener('scroll', scheduleMarkReposition, true);
  window.removeEventListener('resize', scheduleMarkReposition);

  domInspectorState.markClassName = '';

  // Clear the input field, the cached input value, and the autocomplete
  // datalist so the next Mark run starts from a clean slate.
  domInspectorState.markInputValue = '';
  domInspectorState.markDatalistBuilt = false;
  domInspectorState.markClassList = [];
  const inputEl = domInspectorState.panel?.querySelector('.mockkit-dom-inspector__mark-input');
  if (inputEl) {
    inputEl.value = '';
  }
  // Close the custom dropdown and clear any active hover preview.
  closeMarkDropdown();
  clearPreviewMarks(false);

  // Refresh the status text on the panel if it still exists.
  const statusEl = domInspectorState.panel?.querySelector('.mockkit-dom-inspector__mark-status');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.remove('mockkit-dom-inspector__mark-status--err');
  }
  const clearBtn = domInspectorState.panel?.querySelector('.mockkit-dom-inspector__mark-clear-btn');
  if (clearBtn) clearBtn.disabled = true;
}

// rAF-throttled reposition: called on scroll/resize. Deferred to the next
// animation frame so rapid scroll events do not thrash layout.
function scheduleMarkReposition() {
  if (domInspectorState.markRepositionFrame) return;
  domInspectorState.markRepositionFrame = requestAnimationFrame(() => {
    domInspectorState.markRepositionFrame = null;
    repositionClassMarks();
  });
}

// Recompute the bounding rect of each marked element and move its overlay +
// badge to match. Elements that were removed from the DOM or have a zero-size
// rect are hidden rather than removed (the user may re-add them).
function repositionClassMarks() {
  const { markOverlays, markBadges } = domInspectorState;
  for (let i = 0; i < markOverlays.length; i++) {
    const overlay = markOverlays[i];
    const badge = markBadges[i];
    const el = overlay._target;
    if (!el || !el.isConnected) {
      overlay.style.display = 'none';
      if (badge) badge.style.display = 'none';
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      overlay.style.display = 'none';
      if (badge) badge.style.display = 'none';
      continue;
    }
    overlay.style.display = 'block';
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    if (badge) {
      badge.style.display = 'block';
      badge.style.left = `${rect.left}px`;
      badge.style.top = `${rect.top}px`;
    }
  }
}

// ===== Hover preview =====
// When the user hovers a class name in the autocomplete dropdown, show a
// dashed purple outline on every matching element so they can see what
// would be marked before committing. Uses a lighter visual style than
// committed marks to keep the two states visually distinct.

// Show preview overlays for the given class name. If a different preview is
// already active, clear it first (instantly, no fade — the user moved
// directly to a new option).
function previewClassMarks(className) {
  const trimmed = String(className || '').trim();
  if (!trimmed) {
    clearPreviewMarks(false);
    return;
  }
  // Skip rebuild if hovering the same class (e.g. dropdown repositioned).
  if (domInspectorState.markPreviewClassName === trimmed) return;

  clearPreviewMarks(false);
  domInspectorState.markPreviewClassName = trimmed;

  const elements = document.getElementsByClassName(trimmed);
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    const overlay = document.createElement('div');
    overlay.className = 'mockkit-dom-inspector__mark-preview';
    overlay._target = el;
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    document.body.appendChild(overlay);
    domInspectorState.markPreviewOverlays.push(overlay);

    // Trigger the enter animation (background-color + scale) on the next
    // frame so the transition fires from the initial transparent state.
    requestAnimationFrame(() => {
      overlay.classList.add('mockkit-dom-inspector__mark-preview--in');
    });
  }
}

// Remove all preview overlays. When fade is true, apply the fade-out class
// first and remove after the transition ends — used when the dropdown closes
// or the user moves away entirely. When fade is false, remove instantly —
// used when switching between options (no point fading through empty state).
function clearPreviewMarks(fade = true) {
  const overlays = domInspectorState.markPreviewOverlays;
  if (overlays.length === 0) {
    domInspectorState.markPreviewClassName = '';
    return;
  }

  if (fade) {
    // Trigger the CSS fade-out (background + scale + border-color), then
    // remove after the transition completes.
    overlays.forEach((el) => {
      el.classList.remove('mockkit-dom-inspector__mark-preview--in');
      el.classList.add('mockkit-dom-inspector__mark-preview--fade');
    });
    const toRemove = overlays.slice();
    setTimeout(() => {
      toRemove.forEach((el) => el.remove());
    }, 220);
  } else {
    overlays.forEach((el) => el.remove());
  }

  domInspectorState.markPreviewOverlays = [];
  domInspectorState.markPreviewClassName = '';
}

// Query the page for all elements with the given class name and create one
// overlay + numbered badge per match. Registers ESC + scroll/resize listeners
// so marks can be cleared and stay aligned during navigation.
function applyClassMarks(className) {
  // Clean up any previous marks before applying new ones.
  clearClassMarks();

  const trimmed = String(className || '').trim();
  if (!trimmed) return;

  const elements = document.getElementsByClassName(trimmed);
  if (elements.length === 0) {
    const statusEl = domInspectorState.panel?.querySelector('.mockkit-dom-inspector__mark-status');
    if (statusEl) {
      statusEl.textContent = `No elements found for ".${trimmed}"`;
      statusEl.classList.add('mockkit-dom-inspector__mark-status--err');
    }
    return;
  }

  domInspectorState.markClassName = trimmed;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const rect = el.getBoundingClientRect();

    const overlay = document.createElement('div');
    overlay.className = 'mockkit-dom-inspector__mark-overlay';
    overlay._target = el;
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    document.body.appendChild(overlay);
    domInspectorState.markOverlays.push(overlay);

    // Numbered badge in the top-left corner so the user can count and
    // reference individual matches.
    const badge = document.createElement('div');
    badge.className = 'mockkit-dom-inspector__mark-badge';
    badge.textContent = String(i + 1);
    badge.style.left = `${rect.left}px`;
    badge.style.top = `${rect.top}px`;
    // Hide badge for zero-size elements to avoid floating numbers.
    if (rect.width === 0 && rect.height === 0) {
      overlay.style.display = 'none';
      badge.style.display = 'none';
    }
    document.body.appendChild(badge);
    domInspectorState.markBadges.push(badge);
  }

  // Update status text.
  const count = elements.length;
  const statusEl = domInspectorState.panel?.querySelector('.mockkit-dom-inspector__mark-status');
  if (statusEl) {
    statusEl.textContent = `${count} element${count > 1 ? 's' : ''} marked ".${trimmed}" — press Esc to clear`;
    statusEl.classList.remove('mockkit-dom-inspector__mark-status--err');
  }
  const clearBtn = domInspectorState.panel?.querySelector('.mockkit-dom-inspector__mark-clear-btn');
  if (clearBtn) clearBtn.disabled = false;

  // Dedicated ESC listener: fires only while marks exist. Uses capture phase
  // to intercept before page-level handlers. Does NOT stopPropagation — the
  // inspect/measure ESC handler may also run, which is the expected "ESC
  // resets everything" behavior.
  domInspectorState.markKeyListener = (event) => {
    if (event.key === 'Escape') {
      clearClassMarks();
    }
  };
  document.addEventListener('keydown', domInspectorState.markKeyListener, true);

  // Reposition overlays on scroll/resize so marks stay aligned with their
  // elements during page navigation. Capture-phase scroll catches both
  // window and element-level scroll containers.
  document.addEventListener('scroll', scheduleMarkReposition, true);
  window.addEventListener('resize', scheduleMarkReposition);
}

// ===== Custom autocomplete dropdown =====
// Replaces native <datalist> so each option can bind mouseenter → live
// preview, mouseleave → fade-out, click → commit. Positioned under the input.

function openMarkDropdown(input) {
  const classList = domInspectorState.markClassList;
  if (!classList || classList.length === 0) return;

  // Filter by current input value (prefix match, case-insensitive).
  const query = input.value.trim().toLowerCase();
  const filtered = query
    ? classList.filter((c) => c.toLowerCase().includes(query))
    : classList;
  if (filtered.length === 0) {
    closeMarkDropdown();
    return;
  }

  // Reuse existing dropdown or create one.
  let dropdown = domInspectorState.markDropdown;
  if (!dropdown || !dropdown.isConnected) {
    dropdown = document.createElement('div');
    dropdown.className = 'mockkit-dom-inspector__mark-dropdown';
    document.body.appendChild(dropdown);
    domInspectorState.markDropdown = dropdown;
  } else {
    dropdown.innerHTML = '';
  }

  // Position below the input.
  const rect = input.getBoundingClientRect();
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.minWidth = `${rect.width}px`;

  // Build options with match counts.
  filtered.slice(0, 50).forEach((className) => {
    const option = document.createElement('div');
    option.className = 'mockkit-dom-inspector__mark-dropdown-option';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'mockkit-dom-inspector__mark-dropdown-name';
    nameSpan.textContent = className;

    // Show match count so the user knows how many elements each class hits
    // before even hovering. Cheap: getElementsByClassName is fast.
    const count = document.getElementsByClassName(className).length;
    const countSpan = document.createElement('span');
    countSpan.className = 'mockkit-dom-inspector__mark-dropdown-count';
    countSpan.textContent = String(count);

    option.appendChild(nameSpan);
    option.appendChild(countSpan);

    // Hover → live preview (dashed overlay on all matches).
    option.addEventListener('mouseenter', () => {
      previewClassMarks(className);
    });
    option.addEventListener('mouseleave', () => {
      clearPreviewMarks(false);
    });

    // Click → fill input and commit marks.
    option.addEventListener('mousedown', (event) => {
      // mousedown fires before input blur, so we can set the value and
      // trigger Mark without the blur handler closing things prematurely.
      event.preventDefault();
      input.value = className;
      domInspectorState.markInputValue = className;
      applyClassMarks(className);
      closeMarkDropdown();
      clearPreviewMarks(false);
    });

    dropdown.appendChild(option);
  });

  // Trigger open animation on next frame.
  requestAnimationFrame(() => {
    dropdown.classList.add('mockkit-dom-inspector__mark-dropdown--open');
  });
}

function closeMarkDropdown() {
  const dropdown = domInspectorState.markDropdown;
  if (!dropdown) return;
  dropdown.classList.remove('mockkit-dom-inspector__mark-dropdown--open');
  // Remove after the fade-out transition completes.
  setTimeout(() => {
    if (dropdown.isConnected) dropdown.remove();
  }, 150);
  domInspectorState.markDropdown = null;
}

// Build the "Mark by Class" module DOM. Always appended to the panel body
// (after Element Box / Computed Styles), regardless of whether a node is
// picked — the feature is independent of node inspection.
function buildMarkByClassModule() {
  const wrap = document.createElement('div');
  wrap.className = 'mockkit-dom-inspector__mark-module';

  // Header: title + clear button.
  const header = document.createElement('div');
  header.className = 'mockkit-dom-inspector__mark-header';
  const title = document.createElement('span');
  title.className = 'mockkit-dom-inspector__mark-title';
  title.textContent = 'Mark by Class';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'mockkit-dom-inspector__mark-clear-btn';
  clearBtn.textContent = 'Clear';
  clearBtn.title = 'Clear all marks (Esc)';
  clearBtn.disabled = domInspectorState.markOverlays.length === 0;
  clearBtn.addEventListener('click', () => clearClassMarks());
  header.appendChild(title);
  header.appendChild(clearBtn);

  // Input row: text field + Mark button.
  const inputRow = document.createElement('div');
  inputRow.className = 'mockkit-dom-inspector__mark-input-row';
  const input = document.createElement('input');
  input.className = 'mockkit-dom-inspector__mark-input';
  input.type = 'text';
  input.placeholder = 'class name (without dot)';
  input.value = domInspectorState.markInputValue || '';
  input.title = 'Enter a CSS class name (without the leading dot). Press Enter or click Mark.';

  // Autocomplete: a custom dropdown (not native datalist) so we can bind
  // per-option hover for live preview. Built on first focus from the page's
  // unique class names (capped at 200). The built flag lives on
  // domInspectorState so clearClassMarks can reset it.
  input.addEventListener('focus', () => {
    if (domInspectorState.markDatalistBuilt) {
      openMarkDropdown(input);
      return;
    }
    domInspectorState.markDatalistBuilt = true;
    try {
      const all = document.querySelectorAll('[class]');
      const classes = new Set();
      for (let i = 0; i < all.length && classes.size < 200; i++) {
        all[i].classList.forEach((c) => {
          if (c) classes.add(c);
        });
      }
      // Cache the class list so reopening the dropdown does not re-scan.
      domInspectorState.markClassList = Array.from(classes).sort();
      openMarkDropdown(input);
    } catch (e) {
      // If collection fails (huge DOM, sandbox), silently skip — the input
      // still works without autocomplete.
    }
  });

  // Close dropdown + fade out preview on blur (deferred so option clicks fire).
  input.addEventListener('blur', () => {
    setTimeout(() => {
      closeMarkDropdown();
      clearPreviewMarks(true);
    }, 150);
  });

  // Reopen / filter dropdown as the user types.
  input.addEventListener('input', () => {
    if (domInspectorState.markDatalistBuilt) {
      openMarkDropdown(input);
    }
  });

  const markBtn = document.createElement('button');
  markBtn.className = 'mockkit-dom-inspector__mark-btn';
  markBtn.textContent = 'Mark';
  markBtn.addEventListener('click', () => {
    const value = input.value.trim();
    if (!value) return;
    domInspectorState.markInputValue = value;
    applyClassMarks(value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      markBtn.click();
    }
  });
  inputRow.appendChild(input);
  inputRow.appendChild(markBtn);

  // Usage hint.
  const hint = document.createElement('div');
  hint.className = 'mockkit-dom-inspector__mark-hint';
  hint.textContent = 'Enter a class name (without the dot) and press Enter or click Mark. All matching elements get a purple outline with a numbered badge. Press Esc or click Clear to remove marks.';

  // Status line (populated by applyClassMarks / clearClassMarks).
  const status = document.createElement('div');
  status.className = 'mockkit-dom-inspector__mark-status';
  if (domInspectorState.markOverlays.length > 0 && domInspectorState.markClassName) {
    const count = domInspectorState.markOverlays.length;
    status.textContent = `${count} element${count > 1 ? 's' : ''} marked ".${domInspectorState.markClassName}" — press Esc to clear`;
  }

  wrap.appendChild(header);
  wrap.appendChild(inputRow);
  wrap.appendChild(hint);
  wrap.appendChild(status);
  return wrap;
}

function buildBoxModelDiagram(box, node) {
  const wrap = document.createElement('div');
  wrap.className = 'mockkit-dom-inspector__box-model';

  const title = document.createElement('div');
  title.className = 'mockkit-dom-inspector__box-model-title';
  title.textContent = 'Box Model';
  wrap.appendChild(title);

  // Compute the on-page rect for each box model layer so hovering a layer
  // highlights only that layer's actual area on the element.
  // Uses offsetWidth/offsetHeight (border-box size) for accuracy.
  const getElementRects = () => {
    if (!node || !node.isConnected) return null;
    const cs = window.getComputedStyle(node);
    const num = (k) => parseFloat(cs.getPropertyValue(k)) || 0;
    const rect = node.getBoundingClientRect();
    // rect.width/height from getBoundingClientRect includes border + padding
    // but NOT margin — this is the border-box rect.
    const bw = rect.width;
    const bh = rect.height;
    const mt = num('margin-top'), mr = num('margin-right'), mb = num('margin-bottom'), ml = num('margin-left');
    const bt = num('border-top-width'), br = num('border-right-width'), bb = num('border-bottom-width'), bl = num('border-left-width');
    const pt = num('padding-top'), pr = num('padding-right'), pb = num('padding-bottom'), pl = num('padding-left');

    return {
      margin: { left: rect.left - ml, top: rect.top - mt, width: bw + ml + mr, height: bh + mt + mb },
      border: { left: rect.left, top: rect.top, width: bw, height: bh },
      padding: { left: rect.left + bl, top: rect.top + bt, width: bw - bl - br, height: bh - bt - bb },
      content: { left: rect.left + bl + pl, top: rect.top + bt + pt, width: bw - bl - br - pl - pr, height: bh - bt - bb - pt - pb },
    };
  };

  // Attach hover highlight to a layer element. Highlights only that layer's
  // rect on the page. Uses mouseover/mouseout (not mouseenter/mouseleave)
  // because the nested box model structure means mouseenter may not fire
  // reliably when moving between layers.
  const attachHover = (el, layerName, color, borderColor) => {
    let overlay = null;
    el.addEventListener('mouseover', (e) => {
      e.stopPropagation();
      const rects = getElementRects();
      if (!rects) return;
      const r = rects[layerName];
      if (!r || r.width <= 0 || r.height <= 0) return;
      // Remove any existing overlay from sibling layers first.
      if (overlay) { overlay.remove(); overlay = null; }
      overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;z-index:2147483645;pointer-events:none;left:${r.left}px;top:${r.top}px;width:${Math.max(r.width,0)}px;height:${Math.max(r.height,0)}px;background:${color};border:1px solid ${borderColor};box-shadow:0 0 0 1px rgba(255,255,255,0.5);border-radius:2px;`;
      document.body.appendChild(overlay);
    });
    el.addEventListener('mouseout', (e) => {
      // Only clear if we're truly leaving this layer (not entering a child).
      if (!el.contains(e.relatedTarget)) {
        if (overlay) { overlay.remove(); overlay = null; }
      }
    });
    return el;
  };

  // --- Build layers ---

  const margin = document.createElement('div');
  margin.className = 'mockkit-dom-inspector__box-outer';
  const mLabel = document.createElement('span');
  mLabel.className = 'mockkit-dom-inspector__box-margin-label';
  mLabel.textContent = 'margin';
  margin.appendChild(mLabel);
  ['top', 'right', 'bottom', 'left'].forEach((pos) => {
    const val = document.createElement('span');
    val.className = `mockkit-dom-inspector__box-margin-val mockkit-dom-inspector__box-margin-val--${pos}`;
    val.textContent = box.margin[pos];
    margin.appendChild(val);
  });
  attachHover(margin, 'margin', 'rgba(59, 130, 246, 0.25)', 'rgba(37, 99, 235, 0.85)');

  const border = document.createElement('div');
  border.className = 'mockkit-dom-inspector__box-border';
  const bLabel = document.createElement('span');
  bLabel.className = 'mockkit-dom-inspector__box-border-label';
  bLabel.textContent = 'border';
  border.appendChild(bLabel);
  ['top', 'right', 'bottom', 'left'].forEach((pos) => {
    const val = document.createElement('span');
    val.className = `mockkit-dom-inspector__box-border-val mockkit-dom-inspector__box-border-val--${pos}`;
    val.textContent = box.border[pos];
    border.appendChild(val);
  });
  attachHover(border, 'border', 'rgba(16, 185, 129, 0.25)', 'rgba(5, 150, 105, 0.85)');

  const padding = document.createElement('div');
  padding.className = 'mockkit-dom-inspector__box-padding';
  const pLabel = document.createElement('span');
  pLabel.className = 'mockkit-dom-inspector__box-padding-label';
  pLabel.textContent = 'padding';
  padding.appendChild(pLabel);
  ['top', 'right', 'bottom', 'left'].forEach((pos) => {
    const val = document.createElement('span');
    val.className = `mockkit-dom-inspector__box-padding-val mockkit-dom-inspector__box-padding-val--${pos}`;
    val.textContent = box.padding[pos];
    padding.appendChild(val);
  });
  attachHover(padding, 'padding', 'rgba(132, 204, 22, 0.25)', 'rgba(101, 163, 13, 0.85)');

  const content = document.createElement('div');
  content.className = 'mockkit-dom-inspector__box-content';
  content.textContent = `${box.width} × ${box.height}`;
  attachHover(content, 'content', 'rgba(234, 179, 8, 0.25)', 'rgba(202, 138, 4, 0.85)');

  padding.appendChild(content);
  border.appendChild(padding);
  margin.appendChild(border);
  wrap.appendChild(margin);
  return wrap;
}

function showDomInspectorPanel(node, hint) {
  if (domInspectorState.panel) {
    domInspectorState.panel.remove();
    domInspectorState.panel = null;
  }

  const panel = document.createElement('div');
  panel.className = 'mockkit-dom-inspector';

  // Header (draggable).
  const header = document.createElement('div');
  header.className = 'mockkit-dom-inspector__header';
  const title = document.createElement('span');
  title.className = 'mockkit-dom-inspector__title';
  title.textContent = 'DOM Inspector';

  // Re-inspect button: same arrow icon as the floating panel, lets the user
  // pick a different element without closing and reopening the panel.
  const reinspectBtn = document.createElement('button');
  reinspectBtn.type = 'button';
  reinspectBtn.className = 'mockkit-dom-inspector__reinspect';
  reinspectBtn.title = 'Inspect another element';
  const reIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  reIcon.setAttribute('viewBox', '0 0 16 16');
  reIcon.setAttribute('fill', 'none');
  reIcon.innerHTML = '<path d="M3 2l4.5 11 1.8-4.2L13.5 7 3 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/>';
  reinspectBtn.appendChild(reIcon);
  reinspectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // If a different mode (measure) is active, stop it first so inspect can
    // start — startDomInspector otherwise no-ops while active.
    if (domInspectorState.active && domInspectorState.mode !== 'inspect') {
      stopDomInspector();
    }
    startDomInspector();
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mockkit-dom-inspector__close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    clearPickedMarginOverlay();
    panel.remove();
    domInspectorState.panel = null;
  });

  // Minimize button: collapses the panel to just the header bar, same
  // interaction pattern as the rules floating panel's collapse button.
  const minBtn = document.createElement('button');
  minBtn.type = 'button';
  minBtn.className = 'mockkit-dom-inspector__min-btn';
  minBtn.title = 'Minimize';
  minBtn.textContent = '—';
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isMin = panel.classList.toggle('mockkit-dom-inspector--minimized');
    minBtn.textContent = isMin ? '+' : '—';
    minBtn.title = isMin ? 'Expand' : 'Minimize';
  });

  header.appendChild(title);
  header.appendChild(reinspectBtn);
  // Measure toggle button — lives on the DOM Inspector panel header (NOT the
  // mock floating rules panel). Red ruler icon, distinct from the green
  // reinspect aim icon. No ref is stashed: syncInspectorEntryButtons() finds
  // it by class, which survives this panel being destroyed/rebuilt.
  const measureBtn = createDomInspectorMeasureButton();
  header.appendChild(measureBtn);
  header.appendChild(minBtn);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Body.
  const body = document.createElement('div');
  body.className = 'mockkit-dom-inspector__body';

  if (hint) {
    const hintEl = document.createElement('div');
    hintEl.className = 'mockkit-dom-inspector__hint';
    hintEl.textContent = hint;
    body.appendChild(hintEl);
  } else if (node) {
    const { tag, id, classes } = describeDomNode(node);
    const selector = `${tag}${id ? `#${id}` : ''}${classes.length ? `.${classes.join('.')}` : ''}`;

    const tagRow = document.createElement('div');
    tagRow.className = 'mockkit-dom-inspector__tag-row';

    const tagEl = document.createElement('div');
    tagEl.className = 'mockkit-dom-inspector__tag';
    tagEl.textContent = selector;
    tagEl.title = 'Click to highlight the element on the page';
    // Hovering or clicking the selector re-highlights the inspected node so
    // the user can locate it without re-picking.
    const highlightNode = () => {
      if (!node || !node.isConnected) return;
      const prevOutline = node.style.outline;
      const prevOutlineOffset = node.style.outlineOffset;
      node.style.outline = '2px solid #ff4d4f';
      node.style.outlineOffset = '2px';
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const restore = () => {
        node.style.outline = prevOutline;
        node.style.outlineOffset = prevOutlineOffset;
        node.removeEventListener('mouseleave', restore);
      };
      node.addEventListener('mouseleave', restore);
      // Auto-clear after a short timeout in case the mouse never leaves.
      setTimeout(restore, 2000);
    };
    tagEl.addEventListener('mouseenter', highlightNode);
    tagEl.addEventListener('click', highlightNode);
    tagRow.appendChild(tagEl);

    body.appendChild(tagRow);

    // Summary: always-visible grid of the most-used properties.
    // Color items support rgb/hex toggle and click-to-copy.
    const core = readCoreStyles(node);
    if (core) {
      // Wrap the color toggle + Core Styles table in a single panel container
      // so the items look grouped rather than floating loose.
      const corePanel = document.createElement('div');
      corePanel.className = 'mockkit-dom-inspector__core-panel';

      const corePanelHeader = document.createElement('div');
      corePanelHeader.className = 'mockkit-dom-inspector__core-panel-header';

      const corePanelTitle = document.createElement('span');
      corePanelTitle.className = 'mockkit-dom-inspector__core-panel-title';
      corePanelTitle.textContent = 'Core Styles';
      corePanelHeader.appendChild(corePanelTitle);

      const colorToggle = document.createElement('button');
      colorToggle.type = 'button';
      colorToggle.className = 'mockkit-dom-inspector__color-toggle';
      // Default to hex — most designers read colors as #rrggbb.
      let colorMode = 'hex';
      colorToggle.textContent = `Color: ${colorMode.toUpperCase()} ⇄`;
      corePanelHeader.appendChild(colorToggle);
      corePanel.appendChild(corePanelHeader);

      // Core Styles rendered as a Property/Value table for compact scanning.
      const coreTable = document.createElement('table');
      coreTable.className = 'mockkit-dom-inspector__core-table';
      const coreThead = document.createElement('thead');
      coreThead.innerHTML = '<tr><th>Property</th><th>Value</th></tr>';
      coreTable.appendChild(coreThead);
      const coreTbody = document.createElement('tbody');
      const renderCoreRows = (mode) => {
        coreTbody.innerHTML = '';
        coreTbody.appendChild(buildSummaryItem('Color', core.color, core.color, mode, node));
        coreTbody.appendChild(buildSummaryItem('Background', core.backgroundColor, core.backgroundColor, mode, node));
        coreTbody.appendChild(buildSummaryItem('Font Weight', core.fontWeight, null, mode, node));
      };
      renderCoreRows(colorMode);
      coreTable.appendChild(coreTbody);
      corePanel.appendChild(coreTable);
      body.appendChild(corePanel);

      // Toggle re-renders the table body with the new color format.
      colorToggle.addEventListener('click', () => {
        colorMode = colorMode === 'rgb' ? 'hex' : 'rgb';
        colorToggle.textContent = `Color: ${colorMode.toUpperCase()} ⇄`;
        renderCoreRows(colorMode);
      });

      // Box: single editable element box showing width × height with the
      // element's actual background color applied.
      body.appendChild(buildEditableBox(node, core.backgroundColor));
    }

    // Full computed styles: collapsed by default, expand on click.
    const collapseHeader = document.createElement('div');
    collapseHeader.className = 'mockkit-dom-inspector__collapse';
    const arrow = document.createElement('span');
    arrow.className = 'mockkit-dom-inspector__collapse-arrow';
    arrow.textContent = '▶';
    const collapseLabel = document.createElement('span');
    collapseLabel.textContent = 'Computed Styles';
    collapseHeader.appendChild(arrow);
    collapseHeader.appendChild(collapseLabel);

    const fullDetails = document.createElement('div');
    fullDetails.className = 'mockkit-dom-inspector__full-details';
    const props = document.createElement('div');
    props.className = 'mockkit-dom-inspector__props';
    props.innerHTML = readComputedStyles(node);
    fullDetails.appendChild(props);

    collapseHeader.addEventListener('click', () => {
      const isOpen = fullDetails.classList.toggle('mockkit-dom-inspector__full-details--open');
      arrow.classList.toggle('mockkit-dom-inspector__collapse-arrow--open', isOpen);
    });

    body.appendChild(collapseHeader);
    body.appendChild(fullDetails);
  }

  // Mark by Class module: always visible at the bottom of the panel,
  // independent of whether a node was picked. Overlays persist on
  // document.body across panel rebuilds; the input value is preserved in
  // domInspectorState.markInputValue.
  body.appendChild(buildMarkByClassModule());

  panel.appendChild(body);
  document.body.appendChild(panel);
  domInspectorState.panel = panel;

  // Enable drag on the header (position kept in memory only).
  bindDomInspectorDrag(panel, header);

  // Sync entry-button active indicators AFTER the panel is in the DOM. The
  // reinspect/measure buttons are created here, so the sync call inside
  // startDomInspector (which runs before this panel exists) never reached
  // them — leaving them without their --on state. Measure mode also rebuilds
  // this panel on every anchor click, which previously wiped the active
  // class. Re-syncing here keeps inspect (green) and measure (red pulse)
  // indicators correct across every rebuild.
  syncInspectorEntryButtons();

  // Show a persistent margin highlight for the picked node so the user can
  // see margin extents on the page even after the hover overlay is torn down
  // by stopDomInspector.
  if (node) {
    showPickedMarginOverlay(node);
  } else {
    clearPickedMarginOverlay();
  }
}

// Create/refresh the persistent margin overlay for a picked node. Sits on
// the page until the DOM Inspector panel closes. Re-evaluated on scroll/
// resize via the rAF-throttled reposition handler.
// Build a box-model overlay for the picked node: renders margin / border /
// padding / content rectangles on the page with value badges at each edge.
// Reuses createBoxModelOverlay + updateBoxModelOverlay so the picked overlay
// is identical to the hover overlay. Appended to <html> (never <body>) so
// page stacking contexts on <body> (transform/filter/opacity) can't trap the
// fixed-position overlay. Stays on the page until the DOM Inspector panel
// closes; repositioned on scroll/resize by repositionPickedMarginOverlay
// (which calls updateBoxModelOverlay in place — zero DOM churn).
function showPickedMarginOverlay(node) {
  clearPickedMarginOverlay();
  if (!node || !node.isConnected) return;
  // Register scroll/resize listeners once so the overlay tracks the node.
  if (!domInspectorState.pickedListenersBound) {
    domInspectorState.pickedListenersBound = true;
    window.addEventListener('scroll', repositionPickedMarginOverlay, true);
    window.addEventListener('resize', repositionPickedMarginOverlay);
  }
  const overlay = createBoxModelOverlay();
  if (!updateBoxModelOverlay(overlay, node)) {
    overlay.remove();
    return;
  }
  (document.documentElement || document.body).appendChild(overlay);
  domInspectorState.pickedMarginOverlay = overlay;
  domInspectorState.pickedNode = node;
}

function clearPickedMarginOverlay() {
  if (domInspectorState.pickedMarginOverlay) {
    domInspectorState.pickedMarginOverlay.remove();
    domInspectorState.pickedMarginOverlay = null;
  }
  domInspectorState.pickedNode = null;
}

// Reposition the picked-node box-model overlay on scroll/resize so it tracks
// the element. rAF-throttled to coalesce bursts. Updates the overlay in place
// via updateBoxModelOverlay (zero DOM churn) so all layers + labels move
// together without rebuilding.
function repositionPickedMarginOverlay() {
  if (domInspectorState.pickedRepositionFrame) return;
  domInspectorState.pickedRepositionFrame = requestAnimationFrame(() => {
    domInspectorState.pickedRepositionFrame = null;
    const overlay = domInspectorState.pickedMarginOverlay;
    const node = domInspectorState.pickedNode;
    if (!overlay || !node || !node.isConnected) {
      clearPickedMarginOverlay();
      return;
    }
    updateBoxModelOverlay(overlay, node);
  });
}

function bindDomInspectorDrag(panel, handle) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  handle.addEventListener('mousedown', (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    const rect = panel.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    event.preventDefault();
  });

  const onMove = (event) => {
    if (!dragging) return;
    const nextLeft = originLeft + (event.clientX - startX);
    const nextTop = originTop + (event.clientY - startY);
    const maxLeft = window.innerWidth - 60;
    const maxTop = window.innerHeight - 60;
    panel.style.setProperty('left', `${Math.max(0, Math.min(nextLeft, maxLeft))}px`, 'important');
    panel.style.setProperty('top', `${Math.max(0, Math.min(nextTop, maxTop))}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  };

  const onUp = () => { dragging = false; };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  // Keep references so we could remove them if needed later.
  panel._dragHandlers = { onMove, onUp };
}

function pickDomNode(node) {
  showDomInspectorPanel(node, null);
}

// Listen for the DOM Inspect trigger coming from the workbench iframe.
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'MOCKKIT_INSPECT_DOM') return;
  // If measure is active, stop it first so inspect can start.
  if (domInspectorState.active && domInspectorState.mode !== 'inspect') {
    stopDomInspector();
  }
  startDomInspector();
});
injectedCss('icons/iconfont/iconfont.css');
injectedScript('html/iframePage/mock.js');
// Inject the dev-mode flag into the PAGE context before pageScripts loads,
// so the page script can gate its console.info calls without needing
// chrome.runtime (which is unavailable in the page world). The flag is a
// boolean — harmless if read by the page.
const devFlagScript = document.createElement('script');
devFlagScript.textContent = `window.__MOCKKIT_DEV_MODE__ = ${isDevMode};`;
(document.head || document.documentElement).appendChild(devFlagScript);
devFlagScript.remove();
const pageScripts = injectedScript('pageScripts/index.js');
if (pageScripts) {
  pageScripts.addEventListener('load', () => {
    chrome.storage.local.get(['iframeVisible', 'ajaxToolsSwitchOn', 'ajaxToolsSwitchOnNot200', 'ajaxDataList', 'ajaxToolsSkin', 'ajaxToolsDomainWhitelist', SNIFFER_OPEN_KEY], (result) => {
      // console.log('【ajaxTools content.js】【storage】', result);
      const {ajaxToolsSwitchOn = true, ajaxToolsSwitchOnNot200 = true, ajaxDataList = []} = result;
      const domainWhitelist = Array.isArray(result.ajaxToolsDomainWhitelist) && result.ajaxToolsDomainWhitelist.length > 0
        ? result.ajaxToolsDomainWhitelist
        : ['*'];
      const snifferOpen = result[SNIFFER_OPEN_KEY] === true;
      ajaxToolsRuntimeState.domainWhitelist = domainWhitelist;
      // Keep the runtime mirror of the global interceptor switch in sync so
      // applyFloatingPanelState() can hide the floating panel when paused.
      ajaxToolsRuntimeState.ajaxToolsSwitchOn = ajaxToolsSwitchOn;
      applyFloatingPanelState();
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxDataList', value: ajaxDataList}, '*');
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxToolsSwitchOn', value: ajaxToolsSwitchOn}, '*');
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxToolsSwitchOnNot200', value: ajaxToolsSwitchOnNot200}, '*');
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'domainWhitelist', value: domainWhitelist}, '*');
      // Mirror sniffer state to the page script. Hook installation is gated by
      // the Interceptor master switch, so capture only runs while it is on.
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'snifferEnabled', value: snifferOpen}, '*');
    });
  });
}


function closeButton (container) {
  const closeIcon = document.createElement('i');
  closeIcon.title = 'Close';
  closeIcon.className='c-iconfont c-icon-close ajax-interceptor-icon ajax-interceptor-mr-8';
  closeIcon.addEventListener('click', function () {
    container.style.setProperty('transform', 'translateX(calc(100% + 20px))', 'important');
    chrome.storage.local.set({iframeVisible: true});
  })
  return closeIcon;
}
function zoomButton (container) {
  let zoomOut = true;
  const zoomIcon = document.createElement('i');
  zoomIcon.className='c-iconfont c-icon-reduce ajax-interceptor-icon ajax-interceptor-mr-8';
  zoomIcon.addEventListener('click', function () {
    if (zoomOut) { // 缩小
      container.style.setProperty('height', '40px', 'important');
      let timer = setTimeout(() => {
        container.style.setProperty('width', '180px', 'important');
        clearTimeout(timer);
      }, 400);
      zoomOut = false;
      zoomIcon.title = 'Zoom in';
      zoomIcon.className='c-iconfont c-icon-fullscreen ajax-interceptor-icon ajax-interceptor-mr-8';
    } else { // 放大
      container.style.setProperty('width', '580px', 'important');
      let timer = setTimeout(() => {
        container.style.setProperty('height', '100%', 'important');
        clearTimeout(timer);
      }, 400);
      zoomOut = true;
      zoomIcon.title = 'Zoom out';
      zoomIcon.className='c-iconfont c-icon-reduce ajax-interceptor-icon ajax-interceptor-mr-8';
    }
  })
  return zoomIcon;
}
function fullscreenButton (container) {
  let isFullscreen = false;
  const fullscreenIcon = document.createElement('i');
  fullscreenIcon.className = 'c-iconfont c-icon-fullscreen ajax-interceptor-icon ajax-interceptor-mr-8';
  fullscreenIcon.title = 'Fullscreen';
  fullscreenIcon.addEventListener('click', function () {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      // Expand the side panel to cover the entire viewport.
      container.style.setProperty('width', '100%', 'important');
      container.style.setProperty('height', '100%', 'important');
      container.style.setProperty('inset', '0', 'important');
      fullscreenIcon.title = 'Exit fullscreen';
      fullscreenIcon.className = 'c-iconfont c-icon-reduce ajax-interceptor-icon ajax-interceptor-mr-8';
    } else {
      // Restore the default right-docked side panel size.
      container.style.setProperty('width', '580px', 'important');
      container.style.setProperty('height', '100%', 'important');
      container.style.setProperty('inset', '0 0 auto auto', 'important');
      fullscreenIcon.title = 'Fullscreen';
      fullscreenIcon.className = 'c-iconfont c-icon-fullscreen ajax-interceptor-icon ajax-interceptor-mr-8';
    }
  });
  return fullscreenIcon;
}
function pipButton (container) {
  const pipIcon = document.createElement('i');
  pipIcon.title = 'Picture in picture';
  const className ='c-iconfont c-icon-zoomout ajax-interceptor-icon';
  pipIcon.className = className;
  chrome.storage.local.get(['ajaxToolsPipBtnNewHideFlag'], ({ ajaxToolsPipBtnNewHideFlag }) => {
    pipIcon.className = ajaxToolsPipBtnNewHideFlag ? pipIcon.className : `${pipIcon.className} ajax-interceptor-new`;
  });
  pipIcon.addEventListener('click', async function() {
    if (!('documentPictureInPicture' in window)) {
      alert('Your browser does not currently support documentPictureInPicture. You can go to chrome://flags/#document-picture-in-picture-api to enable it.\n' +
        'If you have enabled documentPictureInPicture, please use the HTTPS protocol, or localhost/127.0.0.1, or open the configuration page in a new tab and use picture-in-picture there.');
      return;
    }
    pipIcon.className = className;
    chrome.storage.local.set({ ajaxToolsPipBtnNewHideFlag: true });
    const iframe = document.querySelector('.mockkit-interceptor-iframe');
    const pipWindow = await documentPictureInPicture.requestWindow({width: 580, height: 680});
    // css
    const allCSS = [...document.styleSheets]
      .map((styleSheet) => {
        try {
          return [...styleSheet.cssRules].map((r) => r.cssText).join('');
        } catch (e) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.type = styleSheet.type;
          link.media = styleSheet.media;
          link.href = styleSheet.href;
          pipWindow.document.head.appendChild(link);
        }
      })
      .filter(Boolean)
      .join('\n');
    const style = document.createElement('style');
    style.textContent = allCSS;
    pipWindow.document.head.appendChild(style);
    // js
    [...document.scripts].map((v) => {
      const script = document.createElement('script');
      script.src = v.src;
      script.type = v.type;
      pipWindow.document.head.appendChild(script);
    });
    pipWindow.document.body.append(iframe);
    // 收起侧边
    container.style.setProperty('transform', 'translateX(calc(100% + 20px))', 'important');
    iframe.style.setProperty('height', '100%');
    pipWindow.addEventListener('pagehide', (event) => {
      // 展示侧边
      container.style.setProperty('transform', 'translateX(0)', 'important');
      iframe.style.setProperty('height', 'calc(100% - 40px)');
      container?.append(iframe);
    });
  });
  return pipIcon;
}
function themeModeButton (container) {
  let mode = 'light'; // 'light|dark'
  const themeIcon = document.createElement('i');
  themeIcon.addEventListener('click', function() {
    if (mode === 'dark') {
      mode = 'light';
      themeIcon.title = 'Dark';
      themeIcon.className = 'c-iconfont c-icon-heiyemoshi ajax-interceptor-icon ajax-interceptor-mr-8';
      container.style.setProperty('filter', 'none');
      chrome.storage.local.set({ ajaxToolsSkin: 'light' });
    } else {
      mode = 'dark';
      themeIcon.title = 'Light';
      themeIcon.className = 'c-iconfont c-icon-taiyang ajax-interceptor-icon ajax-interceptor-mr-8';
      container.style.setProperty('filter', 'invert(1)');
      chrome.storage.local.set({ ajaxToolsSkin: 'dark' });
    }
  });
  // 设置初始主题
  chrome.storage.local.get(['ajaxToolsSkin'], (result) => {
    mode = result.ajaxToolsSkin || 'light';
    if (mode === 'dark') {
      themeIcon.title = 'Light';
      themeIcon.className = 'c-iconfont c-icon-taiyang ajax-interceptor-icon ajax-interceptor-mr-8';
      container.style.setProperty('filter', 'invert(1)');
    } else {
      themeIcon.title = 'Dark';
      themeIcon.className = 'c-iconfont c-icon-heiyemoshi ajax-interceptor-icon ajax-interceptor-mr-8';
      container.style.setProperty('filter', 'none');
    }
  });
  return themeIcon;
}
function discussionsButton () {
  const discussionsIcon = document.createElement('i');
  discussionsIcon.title = 'Discussions';
  discussionsIcon.className='c-iconfont c-icon-xiaoxi ajax-interceptor-icon ajax-interceptor-mr-8';
  discussionsIcon.addEventListener('click', function () {
    window.open('https://github.com/PengChen96/ajax-tools/discussions');
  })
  return discussionsIcon;
}
function codeNetButton () {
  const codeNetIcon = document.createElement('i');
  codeNetIcon.title = 'Open the Declarative Network Request Configuration page';
  const className = 'c-iconfont c-icon-code ajax-interceptor-icon ajax-interceptor-mr-8';
  codeNetIcon.className = className;
  chrome.storage.local.get(['ajaxToolsCodeNetBtnNewHideFlag'], ({ ajaxToolsCodeNetBtnNewHideFlag }) => {
    codeNetIcon.className = ajaxToolsCodeNetBtnNewHideFlag ? className : `${className} ajax-interceptor-new`;
  });
  codeNetIcon.addEventListener('click', function () {
    window.open(chrome.runtime.getURL('html/iframePage/dist/declarativeNetRequest.html'));
    codeNetIcon.className = className;
    chrome.storage.local.set({ ajaxToolsCodeNetBtnNewHideFlag: true });
  })
  return codeNetIcon;
}
function newTabButton () {
  const newTabIcon = document.createElement('i');
  newTabIcon.title = 'Open a new tab';
  newTabIcon.className='c-iconfont c-icon-codelibrary ajax-interceptor-icon';
  newTabIcon.addEventListener('click', function () {
    window.open(chrome.runtime.getURL('html/iframePage/dist/index.html'));
  })
  return newTabIcon;
}
function actionBar (container) {
  const header = document.createElement('header');
  header.className = 'ajax-interceptor-action-bar';
  // left: close + fullscreen
  const left = document.createElement('div');
  left.className = 'ajax-interceptor-action-bar__group';
  const closeBtn = closeButton(container);
  left.appendChild(closeBtn);
  const fullscreenBtn = fullscreenButton(container);
  left.appendChild(fullscreenBtn);
  header.appendChild(left);
  // center: version badge (read from the extension manifest so it stays in
  // sync with manifest.json without manual updates).
  const center = document.createElement('div');
  center.className = 'ajax-interceptor-action-bar__version';
  let manifestVersion = '';
  try {
    manifestVersion = (chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '';
  } catch (e) {
    manifestVersion = '';
  }
  center.textContent = manifestVersion ? `v${manifestVersion}` : '';
  header.appendChild(center);
  // right: theme mode
  const right = document.createElement('div');
  right.className = 'ajax-interceptor-action-bar__group';
  const themeModeBtn = themeModeButton(container);
  right.appendChild(themeModeBtn);
  header.appendChild(right);
  return header;
}
// Floating rules panel: a compact, fixed-position overlay that lists the
// current group's rules with toggles. Display is independent of the main
// side panel — it is gated only by the master toggle below and its own
// collapse state. Synchronizes data via the same chrome.storage keys.
const FLOATING_SELECTED_GROUP_KEY = 'ajaxToolsSelectedGroupIndex';
const FLOATING_ENABLED_KEY = 'ajaxToolsFloatingRulesEnabled';

// Receive rule-hit notifications from the page script (pageScripts/index.js)
// and mark the corresponding floating-panel row with a green dot. The hit
// keys are kept in memory only — they reset on page reload.
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.to !== 'contentScript') return;

  if (data.type === 'AJAX_TOOLS_RULE_HIT') {
    if (!data.ruleKey) return;
    if (ajaxToolsRuntimeState.hitRuleKeys[data.ruleKey]) return;
    ajaxToolsRuntimeState.hitRuleKeys[data.ruleKey] = true;
    // Update only the dot indicators without a full re-render.
    refreshFloatingHitDots();
    return;
  }

  // Forward captured XHR/fetch traffic to the iframe workbench so the
  // Request Sniffer module can list it. The page script runs in the page
  // context and cannot message the iframe directly.
  if (data.type === 'AJAX_TOOLS_REQUEST_CAPTURED' && data.payload) {
    // Feed the Toolkit's sniffer sub-panel (host-page DOM). This is the
    // primary consumer now; the iframe forward below is kept for any legacy
    // listeners but is no longer required by the React workbench.
    pushSnifferCapture(data.payload);
    const iframe = document.querySelector('.mockkit-interceptor-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'AJAX_TOOLS_REQUEST_CAPTURED',
        payload: data.payload,
      }, '*');
    }
    return;
  }
});

// Apply the current enabled/collapsed state to the floating panel DOM.
// The panel is hidden entirely when the master toggle is off; otherwise it
// toggles between the expanded list view and the collapsed mock grid.
function applyFloatingPanelState() {
  // Lazily ensure the panel element exists before applying state. Some entry
  // paths (e.g. toggling the Floating Rules switch from the workbench) can
  // arrive here before mountPanelContainer has run to completion on slow
  // sites; without this, the early `if (!panel) return` would leave the
  // panel stuck at its CSS default (display:none) forever.
  if (!ajaxToolsRuntimeState.floatingPanel) {
    createFloatingRulesPanel();
  }
  const panel = ajaxToolsRuntimeState.floatingPanel;
  if (!panel) return;

  // Never show the floating panel on hostnames the user did not allowlist.
  if (!currentHostWhitelisted()) {
    panel.style.display = 'none';
    return;
  }

  // The floating rules panel is independent of the global interceptor
  // switch — users can toggle rules even when interception is paused
  // (the rules simply won't apply until interception resumes). Do NOT
  // hide the panel based on ajaxToolsSwitchOn.

  if (!ajaxToolsRuntimeState.floatingRulesEnabled) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  // Shift out of the workbench's footprint whenever the panel (re)appears,
  // so it is never hidden behind the open side panel.
  repositionFloatingRulesPanel();
  // The panel DOM may have been (re)built; make sure it's in the document
  // before relying on getBoundingClientRect inside reposition.
  if (!panel.isConnected) {
    const mountTarget = document.body || document.documentElement;
    if (mountTarget) mountTarget.appendChild(panel);
  }
}

function loadFloatingRulesState(callback) {
  chrome.storage.local.get([FLOATING_ENABLED_KEY], (result) => {
    ajaxToolsRuntimeState.floatingRulesEnabled = result[FLOATING_ENABLED_KEY] !== false;
    applyFloatingPanelState();
    if (typeof callback === 'function') callback();
  });
}

// One-click close: fully hides the floating rules panel by flipping the
// master enabled flag. Reuses the Toolkit rules toggle so the Toolkit panel's
// Floating Rules switch (and the workbench) stays in sync. The panel can be
// re-opened from the Toolkit panel or the workbench switch.
function closeFloatingRules() {
  setToolkitRulesOpen(false);
}

// Drag the floating panel by its header. Position is kept in memory only —
// a page refresh resets it to the default top-right corner.
function bindFloatingPanelDrag(panel) {
  const header = panel.querySelector('.mockkit-floating-rules__header');
  const dragHandles = [header].filter(Boolean);
  dragHandles.forEach((handle) => {
    if (handle.dataset.dragBound === '1') return;
    handle.dataset.dragBound = '1';

    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let dragging = false;

    const onMove = (event) => {
      if (!dragging) return;
      const nextLeft = originLeft + (event.clientX - startX);
      const nextTop = originTop + (event.clientY - startY);
      // Clamp to the viewport so the panel cannot be dragged fully off-screen.
      const maxLeft = window.innerWidth - 60;
      const maxTop = window.innerHeight - 60;
      // Use setProperty with !important because the base stylesheet pins
      // right/bottom with !important — plain inline styles can't override
      // that, which previously made the panel un-draggable.
      panel.style.setProperty('left', `${Math.max(0, Math.min(nextLeft, maxLeft))}px`, 'important');
      panel.style.setProperty('top', `${Math.max(0, Math.min(nextTop, maxTop))}px`, 'important');
      panel.style.setProperty('right', 'auto', 'important');
      panel.style.setProperty('bottom', 'auto', 'important');
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('mockkit-floating-rules__header--dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', (event) => {
      // Ignore drag when clicking on buttons (close / csr) inside the header.
      if (event.target.closest('button')) return;
      dragging = true;
      // Mark the panel as user-positioned so the auto-reposition logic (which
      // shifts it left when the workbench opens) stops overriding its place.
      ajaxToolsRuntimeState.floatingPanelDragged = true;
      handle.classList.add('mockkit-floating-rules__header--dragging');
      const rect = panel.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      event.preventDefault();
    });

    // Double-click the header (away from buttons) to snap the panel back to
    // its default top-right anchor without a page refresh. Position is in-memory
    // only, so without this the only reset path was reloading the tab.
    handle.addEventListener('dblclick', (event) => {
      if (event.target.closest('button')) return;
      ajaxToolsRuntimeState.floatingPanelDragged = false;
      repositionFloatingRulesPanel();
    });
  });
}

// CSR/SSR toggle: delegates to the service worker which rewrites the tab URL.
// Local state is mirrored on the button so the user gets immediate feedback.
function syncFloatingCsrBtnState(btn) {
  if (!chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ type: 'GET_PAGE_RENDER_MODE' }, (response) => {
    if (!response?.ok) return;
    const on = Boolean(response.csrEnabled);
    btn.textContent = on ? 'CSR' : 'SSR';
    btn.title = on ? 'Currently CSR. Click to switch to SSR.' : 'Currently SSR. Click to switch to CSR.';
    btn.classList.toggle('mockkit-floating-rules__csr-btn--on', on);
  });
}

function createFloatingCsrButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mockkit-floating-rules__csr-btn';
  btn.textContent = 'SSR';
  btn.title = 'Toggle CSR/SSR render mode';
  btn.addEventListener('click', () => {
    if (!chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: 'GET_PAGE_RENDER_MODE' }, (response) => {
      if (!response?.ok) return;
      const nextCsr = !response.csrEnabled;
      chrome.runtime.sendMessage({ type: 'SET_PAGE_RENDER_MODE', csrEnabled: nextCsr }, (setResponse) => {
        if (!setResponse?.ok) return;
        // Optimistic UI update — the page will reload shortly.
        btn.textContent = nextCsr ? 'CSR' : 'SSR';
        btn.classList.toggle('mockkit-floating-rules__csr-btn--on', nextCsr);
      });
    });
  });
  syncFloatingCsrBtnState(btn);
  return btn;
}

// DOM Inspect entry: a small aim/arrow icon that triggers the same inspector
// flow as the workbench's DOM Inspect button. Lets users pick a node without
// opening the side panel.
function createFloatingInspectButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mockkit-floating-rules__inspect-btn';
  btn.title = 'Inspect a DOM node';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('fill', 'none');
  icon.innerHTML = '<path d="M3 2l4.5 11 1.8-4.2L13.5 7 3 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/>';
  btn.appendChild(icon);

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    // If a different mode (measure) is active, stop it first so inspect can
    // start — startDomInspector otherwise no-ops while active.
    if (domInspectorState.active && domInspectorState.mode !== 'inspect') {
      stopDomInspector();
    }
    startDomInspector();
  });
  return btn;
}

// Measure entry button for the DOM INSPECTOR panel header (NOT the mock
// floating rules panel). A ruler icon that toggles anchor+hover distance
// measurement mode. Distinct from the reinspect aim icon (red ruler vs green
// arrow) so the user knows this is measurement, not element inspection. While
// active the button stays solid red + pulses; clicking again or pressing Esc
// exits. See .mockkit-dom-inspector__measure-btn CSS for the active state.
function createDomInspectorMeasureButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mockkit-dom-inspector__measure-btn';
  btn.title = 'Measure distance between two elements';

  // Ruler icon — a straightedge with tick marks, unambiguous "measurement".
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('fill', 'none');
  icon.innerHTML = '<rect x="1.5" y="5" width="13" height="6" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M4 5v2M6.5 5v3M9 5v2M11.5 5v3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>';
  btn.appendChild(icon);

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    // Toggle: if already measuring, exit; otherwise start in measure mode.
    if (domInspectorState.active && domInspectorState.mode === 'measure') {
      stopDomInspector();
      return;
    }
    // If inspect mode is active, switch off it before entering measure.
    if (domInspectorState.active) {
      stopDomInspector();
    }
    startDomInspector({ mode: 'measure' });
  });
  return btn;
}

function renderFloatingRules() {
  const panel = ajaxToolsRuntimeState.floatingPanel;
  if (!panel) return;

  chrome.storage.local.get(['ajaxDataList', FLOATING_SELECTED_GROUP_KEY], (result) => {
    const ajaxDataList = result?.ajaxDataList || [];
    const groupIndex = typeof result?.[FLOATING_SELECTED_GROUP_KEY] === 'number'
      ? result[FLOATING_SELECTED_GROUP_KEY]
      : 0;
    const group = ajaxDataList[groupIndex] || null;
    const listEl = panel.querySelector('.mockkit-floating-rules__list');
    const headerEl = panel.querySelector('.mockkit-floating-rules__title');
    const countEl = panel.querySelector('.mockkit-floating-rules__count');

    const groupTitle = group?.summaryText || `Group ${groupIndex + 1}`;
    if (headerEl) headerEl.textContent = groupTitle;

    const interfaceList = group?.interfaceList || [];
    if (countEl) countEl.textContent = `${interfaceList.length} rules`;

    // Enable/disable the group switcher arrows based on group count.
    const prevBtn = panel.querySelector('.mockkit-floating-rules__group-btn:first-child');
    const nextBtn = panel.querySelector('.mockkit-floating-rules__group-btn:last-child');
    const hasMultipleGroups = ajaxDataList.length > 1;
    if (prevBtn) prevBtn.disabled = !hasMultipleGroups;
    if (nextBtn) nextBtn.disabled = !hasMultipleGroups;

    if (!listEl) return;

    if (interfaceList.length < 1) {
      listEl.innerHTML = '<div class="mockkit-floating-rules__empty">No rules in this group</div>';
      return;
    }

    listEl.innerHTML = '';
    interfaceList.forEach((ruleItem, ruleIndex) => {
      const row = document.createElement('div');
      row.className = 'mockkit-floating-rules__item';
      row.dataset.ruleKey = ruleItem.key || '';

      // Hit indicator: a green dot shown when this rule has matched at
      // least one request during the current page session.
      const hitDot = document.createElement('span');
      hitDot.className = 'mockkit-floating-rules__item-hit';
      hitDot.title = 'This rule has matched a request';
      if (ajaxToolsRuntimeState.hitRuleKeys[ruleItem.key]) {
        hitDot.classList.add('mockkit-floating-rules__item-hit--on');
      }

      // Toggle switch — writes back to storage so the React workbench syncs.
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = ruleItem.open !== false;
      toggle.className = 'mockkit-floating-rules__item-toggle';
      toggle.addEventListener('change', () => {
        chrome.storage.local.get(['ajaxDataList'], (storageResult) => {
          const nextList = storageResult?.ajaxDataList || [];
          if (!nextList[groupIndex]) return;
          // Mutate a copy to trigger React + storage change listeners.
          const nextAjaxDataList = nextList.map((grp, idx) => {
            if (idx !== groupIndex) return grp;
            return {
              ...grp,
              interfaceList: grp.interfaceList.map((item, i) =>
                i === ruleIndex ? { ...item, open: toggle.checked } : item
              ),
            };
          });
          chrome.storage.local.set({ ajaxDataList: nextAjaxDataList });
        });
      });

      const body = document.createElement('div');
      body.className = 'mockkit-floating-rules__item-body';

      const urlLine = document.createElement('div');
      urlLine.className = 'mockkit-floating-rules__item-url';
      urlLine.textContent = ruleItem.request || '(empty)';
      body.appendChild(urlLine);

      if (ruleItem.requestDes) {
        const note = document.createElement('div');
        note.className = 'mockkit-floating-rules__item-note';
        note.textContent = ruleItem.requestDes;
        body.appendChild(note);
      }

      // Edit entry: reveal the main side panel (so the modal is visible)
      // and ask the iframe to open the edit modal for this rule.
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'mockkit-floating-rules__item-edit';
      editBtn.textContent = 'Edit';
      editBtn.title = 'Edit this rule in the workbench';
      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const mainPanel = ajaxToolsRuntimeState.panelContainer;
        if (mainPanel) {
          mainPanel.style.setProperty('transform', 'translateX(0)', 'important');
          chrome.storage.local.set({ iframeVisible: true });
        }
        const iframe = document.querySelector('.mockkit-interceptor-iframe');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            { type: 'AJAX_TOOLS_OPEN_EDIT', groupIndex, ruleIndex },
            '*'
          );
        }
      });

      // Inline edit icon: toggles in-place editing of the matched path
      // (request) and the note (requestDes) without opening the workbench.
      // Enter or blur commits the change back to storage.
      const pencilIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      pencilIcon.setAttribute('viewBox', '0 0 16 16');
      pencilIcon.setAttribute('fill', 'none');
      pencilIcon.innerHTML = '<path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>';

      const inlineEditBtn = document.createElement('button');
      inlineEditBtn.type = 'button';
      inlineEditBtn.className = 'mockkit-floating-rules__item-inline-edit';
      inlineEditBtn.title = 'Edit path and note inline';
      inlineEditBtn.appendChild(pencilIcon);

      let editing = false;
      const enterInlineEdit = () => {
        if (editing) return;
        editing = true;
        inlineEditBtn.classList.add('mockkit-floating-rules__item-inline-edit--active');
        body.innerHTML = '';

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'mockkit-floating-rules__item-input';
        urlInput.value = ruleItem.request || '';
        urlInput.placeholder = 'matched url';
        body.appendChild(urlInput);

        const noteInput = document.createElement('input');
        noteInput.type = 'text';
        noteInput.className = 'mockkit-floating-rules__item-input mockkit-floating-rules__item-input--note';
        noteInput.value = ruleItem.requestDes || '';
        noteInput.placeholder = 'note';
        body.appendChild(noteInput);

        urlInput.focus();
        urlInput.select();

        const commit = () => {
          if (!editing) return;
          editing = false;
          const nextRequest = urlInput.value;
          const nextNote = noteInput.value;
          chrome.storage.local.get(['ajaxDataList'], (storageResult) => {
            const nextList = storageResult?.ajaxDataList || [];
            if (!nextList[groupIndex]) return;
            const nextAjaxDataList = nextList.map((grp, idx) => {
              if (idx !== groupIndex) return grp;
              return {
                ...grp,
                interfaceList: grp.interfaceList.map((item, i) =>
                  i === ruleIndex
                    ? { ...item, request: nextRequest, requestDes: nextNote }
                    : item
                ),
              };
            });
            chrome.storage.local.set({ ajaxDataList: nextAjaxDataList });
          });
          // Optimistically restore the display; the storage listener will
          // rebuild the list shortly, keeping it in sync.
          inlineEditBtn.classList.remove('mockkit-floating-rules__item-inline-edit--active');
          body.innerHTML = '';
          const restoredUrl = document.createElement('div');
          restoredUrl.className = 'mockkit-floating-rules__item-url';
          restoredUrl.textContent = nextRequest || '(empty)';
          body.appendChild(restoredUrl);
          if (nextNote) {
            const restoredNote = document.createElement('div');
            restoredNote.className = 'mockkit-floating-rules__item-note';
            restoredNote.textContent = nextNote;
            body.appendChild(restoredNote);
          }
        };

        const onInputKey = (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            editing = false;
            inlineEditBtn.classList.remove('mockkit-floating-rules__item-inline-edit--active');
            body.innerHTML = '';
            const restoredUrl = document.createElement('div');
            restoredUrl.className = 'mockkit-floating-rules__item-url';
            restoredUrl.textContent = ruleItem.request || '(empty)';
            body.appendChild(restoredUrl);
            if (ruleItem.requestDes) {
              const restoredNote = document.createElement('div');
              restoredNote.className = 'mockkit-floating-rules__item-note';
              restoredNote.textContent = ruleItem.requestDes;
              body.appendChild(restoredNote);
            }
          }
        };

        urlInput.addEventListener('keydown', onInputKey);
        noteInput.addEventListener('keydown', onInputKey);
        urlInput.addEventListener('blur', () => {
          // Defer so clicking noteInput isn't treated as a commit trigger.
          setTimeout(() => {
            if (editing && document.activeElement !== noteInput) commit();
          }, 120);
        });
        noteInput.addEventListener('blur', () => {
          setTimeout(() => {
            if (editing && document.activeElement !== urlInput) commit();
          }, 120);
        });
      };

      inlineEditBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (editing) {
          // Clicking the pencil while editing acts as commit.
          const inputs = body.querySelectorAll('input');
          if (inputs.length) inputs[inputs.length - 1].blur();
        } else {
          enterInlineEdit();
        }
      });

      row.appendChild(hitDot);
      row.appendChild(toggle);
      row.appendChild(body);
      row.appendChild(inlineEditBtn);
      row.appendChild(editBtn);

      // Fork entry: deep-copy the current rule into a backup inserted right
      // after this row. The clone gets a fresh key and is auto-expanded so
      // the user can immediately tell the copy succeeded.
      const forkBtn = document.createElement('button');
      forkBtn.type = 'button';
      forkBtn.className = 'mockkit-floating-rules__item-fork';
      forkBtn.textContent = 'Fork';
      forkBtn.title = 'Duplicate this rule into the next slot';
      forkBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        chrome.storage.local.get(['ajaxDataList'], (storageResult) => {
          const nextList = storageResult?.ajaxDataList || [];
          if (!nextList[groupIndex]) return;
          const targetGroup = nextList[groupIndex];
          const sourceRule = targetGroup.interfaceList[ruleIndex];
          if (!sourceRule) return;

          const forkedRule = JSON.parse(JSON.stringify(sourceRule));
          const newKey = String(Date.now());
          forkedRule.key = newKey;

          const nextInterfaceList = [...targetGroup.interfaceList];
          nextInterfaceList.splice(ruleIndex + 1, 0, forkedRule);

          const nextAjaxDataList = nextList.map((grp, idx) => {
            if (idx !== groupIndex) return grp;
            return {
              ...grp,
              interfaceList: nextInterfaceList,
              collapseActiveKeys: [...grp.collapseActiveKeys, newKey],
            };
          });
          chrome.storage.local.set({ ajaxDataList: nextAjaxDataList });
        });
      });
      row.appendChild(forkBtn);

      listEl.appendChild(row);
    });
  });
}

// Update the hit-dot indicators without rebuilding the whole list. Called
// when a rule-hit notification arrives from the page script.
function refreshFloatingHitDots() {
  const panel = ajaxToolsRuntimeState.floatingPanel;
  if (!panel) return;
  const dots = panel.querySelectorAll('.mockkit-floating-rules__item-hit');
  dots.forEach((dot) => {
    const row = dot.closest('.mockkit-floating-rules__item');
    const key = row?.dataset?.ruleKey;
    if (key && ajaxToolsRuntimeState.hitRuleKeys[key]) {
      dot.classList.add('mockkit-floating-rules__item-hit--on');
    }
  });
}

function createFloatingRulesPanel() {
  if (ajaxToolsRuntimeState.floatingPanel?.isConnected) {
    return ajaxToolsRuntimeState.floatingPanel;
  }

  const existing = document.getElementById('mockkit-floating-rules');
  if (existing) {
    ajaxToolsRuntimeState.floatingPanel = existing;
    return existing;
  }

  const panel = document.createElement('div');
  panel.className = 'mockkit-floating-rules';
  panel.id = 'mockkit-floating-rules';

  const header = document.createElement('div');
  header.className = 'mockkit-floating-rules__header';
  const headerLeft = document.createElement('div');
  headerLeft.className = 'mockkit-floating-rules__header-left';
  const title = document.createElement('span');
  title.className = 'mockkit-floating-rules__title';
  title.textContent = 'Rules';

  // Group switcher: prev/next arrows to cycle through groups without
  // opening the workbench. Reads/writes the same storage key the workbench
  // uses, so the selection stays in sync everywhere.
  const groupSwitch = document.createElement('div');
  groupSwitch.className = 'mockkit-floating-rules__group-switch';
  const groupPrevBtn = document.createElement('button');
  groupPrevBtn.type = 'button';
  groupPrevBtn.className = 'mockkit-floating-rules__group-btn';
  groupPrevBtn.textContent = '‹';
  groupPrevBtn.title = 'Previous group';
  groupPrevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.storage.local.get(['ajaxDataList', FLOATING_SELECTED_GROUP_KEY], (res) => {
      const total = (res?.ajaxDataList || []).length;
      if (total < 2) return;
      const cur = typeof res?.[FLOATING_SELECTED_GROUP_KEY] === 'number' ? res[FLOATING_SELECTED_GROUP_KEY] : 0;
      const next = (cur - 1 + total) % total;
      chrome.storage.local.set({ [FLOATING_SELECTED_GROUP_KEY]: next });
    });
  });
  const groupNextBtn = document.createElement('button');
  groupNextBtn.type = 'button';
  groupNextBtn.className = 'mockkit-floating-rules__group-btn';
  groupNextBtn.textContent = '›';
  groupNextBtn.title = 'Next group';
  groupNextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.storage.local.get(['ajaxDataList', FLOATING_SELECTED_GROUP_KEY], (res) => {
      const total = (res?.ajaxDataList || []).length;
      if (total < 2) return;
      const cur = typeof res?.[FLOATING_SELECTED_GROUP_KEY] === 'number' ? res[FLOATING_SELECTED_GROUP_KEY] : 0;
      const next = (cur + 1) % total;
      chrome.storage.local.set({ [FLOATING_SELECTED_GROUP_KEY]: next });
    });
  });
  groupSwitch.appendChild(groupPrevBtn);
  groupSwitch.appendChild(groupNextBtn);

  const count = document.createElement('span');
  count.className = 'mockkit-floating-rules__count';
  count.textContent = '0 rules';
  headerLeft.appendChild(title);
  headerLeft.appendChild(groupSwitch);
  headerLeft.appendChild(count);
  header.appendChild(headerLeft);

  const headerActions = document.createElement('div');
  headerActions.className = 'mockkit-floating-rules__header-actions';
  const csrBtn = createFloatingCsrButton();
  headerActions.appendChild(csrBtn);
  const inspectBtn = createFloatingInspectButton();
  headerActions.appendChild(inspectBtn);
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'mockkit-floating-rules__close-btn';
  collapseBtn.type = 'button';
  collapseBtn.title = 'Close';
  collapseBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  collapseBtn.addEventListener('click', closeFloatingRules);
  headerActions.appendChild(collapseBtn);
  header.appendChild(headerActions);
  panel.appendChild(header);

  // Enable header-drag repositioning (position kept in memory only).
  bindFloatingPanelDrag(panel);

  const list = document.createElement('div');
  list.className = 'mockkit-floating-rules__list';
  panel.appendChild(list);

  ajaxToolsRuntimeState.floatingPanel = panel;
  return panel;
}

function createPanelContainer() {
  if (ajaxToolsRuntimeState.panelContainer?.isConnected) {
    return ajaxToolsRuntimeState.panelContainer;
  }

  const existingContainer = document.getElementById('mockkit-interceptor-container');
  if (existingContainer) {
    ajaxToolsRuntimeState.panelContainer = existingContainer;
    return ajaxToolsRuntimeState.panelContainer;
  }

  const container = document.createElement('div');
  container.className = 'mockkit-interceptor-container';
  container.id = 'mockkit-interceptor-container';
  container.style.setProperty('transform', 'translateX(calc(100% + 20px))', 'important');

  const header = actionBar(container);
  container.appendChild(header);

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL(`html/iframePage/dist/index.html?pageOrigin=${encodeURIComponent(window.location.origin)}`);
  iframe.className = 'mockkit-interceptor-iframe';
  container.appendChild(iframe);

  ajaxToolsRuntimeState.panelContainer = container;
  return ajaxToolsRuntimeState.panelContainer;
}

function bindPanelMessageListener(container) {
  if (ajaxToolsRuntimeState.panelMessageListenerBound) {
    return;
  }

  const buildRenderModeUrl = (nextCsrEnabled) => {
    const url = new URL(window.location.href);

    if (nextCsrEnabled) {
      url.searchParams.set('__csr', '1');
    } else {
      url.searchParams.delete('__csr');
    }

    return url.toString();
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    logDev('【content】【mockkit-tools-iframe-show】receive message', request);
    const {type, iframeVisible, csrEnabled} = request;
    if (type === 'PING_AJAX_TOOLS_PANEL') {
      sendResponse({ ok: true });
      return true;
    }
    if (type === 'iframeToggle') {
      container.style.setProperty('transform', iframeVisible ? 'translateX(0)' : 'translateX(calc(100% + 20px))', 'important');
      // The floating rules panel is independent of the main side panel —
      // its visibility is controlled only by the master toggle and its
      // own collapse state, so we do not touch it here.
      sendResponse({nextIframeVisible: !iframeVisible});
    }
    if (type === 'GET_PAGE_RENDER_MODE') {
      sendResponse({
        ok: true,
        csrEnabled: new URL(window.location.href).searchParams.get('__csr') === '1',
        currentUrl: window.location.href,
      });
    }
    if (type === 'SET_PAGE_RENDER_MODE') {
      const nextUrl = buildRenderModeUrl(Boolean(csrEnabled));
      sendResponse({
        ok: true,
        csrEnabled: Boolean(csrEnabled),
        currentUrl: nextUrl,
      });
      if (nextUrl !== window.location.href) {
        setTimeout(() => {
          window.location.replace(nextUrl);
        }, 0);
      }
    }
    return true;
  });

  ajaxToolsRuntimeState.panelMessageListenerBound = true;
}

// --- Request Sniffer panel (Toolkit sub-tool) ------------------------------
// A floating panel that lists live-captured XHR/fetch traffic on the page.
// Each row can be promoted to a mock rule in the currently selected group via
// the Mock button (posts MOCKKIT_MOCK_CAPTURE to the iframe, which calls
// onMockCapture). Mirrors the sniffer state in content.js so the UI lives on
// the host page alongside the other Toolkit sub-tools, keeping the iframe
// focused on rule editing.
const SNIFFER_PANEL_ID = 'mockkit-sniffer-panel';
const SNIFFER_MAX_CAPTURES = 100;
// Persisted sniffer sub-toggle state so a page refresh restores it. Lives
// under the Toolkit panel — only meaningful when the Toolkit is visible, but
// stored independently so the state survives even if the user closes Toolkit.
const SNIFFER_OPEN_KEY = 'ajaxToolsSnifferPanelOpen';
let snifferState = {
  panelEl: null,
  requests: [],      // ring buffer of captures (newest first)
  nextId: 1,
  keyword: '',       // search filter (method or url substring)
  visible: false,
  collapsed: false,  // when true, only the header bar is visible
};

function injectSnifferStyle() {
  if (document.getElementById('mockkit-sniffer-style')) return;
  const style = document.createElement('style');
  style.id = 'mockkit-sniffer-style';
  style.textContent = `
    .mockkit-sniffer-panel {
      position: fixed !important;
      left: 24px !important;
      bottom: 24px !important;
      width: 380px !important;
      max-height: calc(100vh - 48px) !important;
      display: none;
      flex-direction: column;
      z-index: 2147483646 !important;
      border: 1px solid rgb(27 40 34 / 8%) !important;
      border-radius: 16px !important;
      box-shadow: 0 20px 60px rgb(37 54 46 / 18%), 0 4px 12px rgb(37 54 46 / 8%) !important;
      background: linear-gradient(160deg, rgb(255 255 255 / 96%), rgb(248 245 238 / 94%)) !important;
      backdrop-filter: blur(20px);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #1b2822;
      /* Anchored bottom-left so it never overlaps Floating Rules (top-right),
         DOM Inspector (top-left), or Toolkit (bottom-right). Once the user
         drags it, repositionSnifferPanel leaves it alone. */
      transition: box-shadow 0.2s ease, left 0.3s ease, bottom 0.3s ease;
    }
    .mockkit-sniffer-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgb(27 40 34 / 6%);
      font-weight: 700;
      font-size: 13px;
      background: linear-gradient(135deg, rgb(255 255 255 / 80%), rgb(247 244 236 / 70%));
      flex-shrink: 0;
      cursor: grab;
      user-select: none;
      letter-spacing: 0.02em;
    }
    .mockkit-sniffer-panel__header--dragging {
      cursor: grabbing;
      background: linear-gradient(135deg, rgb(26 155 127 / 6%), rgb(247 244 236 / 70%));
    }
    .mockkit-sniffer-panel__title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mockkit-sniffer-panel__title::before {
      content: '';
      width: 6px; height: 6px; border-radius: 999px;
      background: #1a9b7f; flex-shrink: 0;
    }
    .mockkit-sniffer-panel__count {
      font-weight: 500;
      font-size: 11px;
      color: rgb(27 40 34 / 45%);
      padding: 1px 7px;
      border-radius: 999px;
      background: rgb(27 40 34 / 5%);
    }
    .mockkit-sniffer-panel__close {
      flex-shrink: 0;
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 8px;
      background: transparent; cursor: pointer;
      color: rgb(27 40 34 / 40%); line-height: 1;
      transition: all 0.15s ease;
      padding: 0;
    }
    .mockkit-sniffer-panel__close svg {
      width: 14px; height: 14px;
      display: block;
    }
    .mockkit-sniffer-panel__close:hover {
      background: rgb(27 40 34 / 6%);
      color: rgb(27 40 34 / 70%);
    }
    .mockkit-sniffer-panel__toolbar {
      display: flex;
      gap: 6px;
      padding: 10px 12px;
      border-bottom: 1px solid rgb(27 40 34 / 5%);
      flex-shrink: 0;
    }
    .mockkit-sniffer-panel__search {
      flex: 1;
      min-width: 0;
      border: 1px solid rgb(27 40 34 / 14%);
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 12px;
      font-family: inherit;
      background: rgb(255 255 255 / 80%);
      color: #1b2822;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .mockkit-sniffer-panel__search:focus {
      border-color: rgb(26 155 127 / 55%);
      box-shadow: 0 0 0 2px rgb(26 155 127 / 12%);
    }
    .mockkit-sniffer-panel__clear {
      flex-shrink: 0;
      border: 1px solid rgb(27 40 34 / 14%);
      border-radius: 8px;
      padding: 5px 10px;
      background: #fff;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      color: rgb(27 40 34 / 60%);
      transition: all 0.15s ease;
    }
    .mockkit-sniffer-panel__clear:hover:not(:disabled) {
      border-color: rgb(27 40 34 / 30%);
      color: #1b2822;
    }
    .mockkit-sniffer-panel__clear:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    /* Intercept toggle bar: sits between header and toolbar. The switch
       mirrors the global ajaxToolsSwitchOn state. */
    .mockkit-sniffer-panel__intercept {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      border-bottom: 1px solid rgb(27 40 34 / 5%);
      flex-shrink: 0;
    }
    .mockkit-sniffer-panel__intercept-label {
      font-size: 12px;
      font-weight: 600;
      color: #1b2822;
    }
    .mockkit-sniffer-panel__intercept-switch {
      position: relative;
      width: 36px; height: 20px; border-radius: 999px;
      border: none; cursor: pointer; padding: 0;
      background: rgb(27 40 34 / 22%);
      transition: background 0.2s ease;
      flex-shrink: 0;
    }
    .mockkit-sniffer-panel__intercept-switch::after {
      content: '';
      position: absolute; top: 2px; left: 2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
      transition: transform 0.2s ease;
    }
    .mockkit-sniffer-panel__intercept-switch.is-on {
      background: #1a9b7f;
    }
    .mockkit-sniffer-panel__intercept-switch.is-on::after {
      transform: translateX(16px);
    }
    .mockkit-sniffer-panel__list {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      padding: 6px;
    }
    .mockkit-sniffer-panel__list::-webkit-scrollbar { width: 6px; }
    .mockkit-sniffer-panel__list::-webkit-scrollbar-thumb {
      background: rgb(27 40 34 / 12%);
      border-radius: 999px;
    }
    .mockkit-sniffer-panel__list::-webkit-scrollbar-track { background: transparent; }
    .mockkit-sniffer-panel__item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      transition: background 0.15s ease;
    }
    .mockkit-sniffer-panel__item:hover {
      background: rgb(26 155 127 / 5%);
    }
    .mockkit-sniffer-panel__item-main {
      flex: 1;
      min-width: 0;
    }
    .mockkit-sniffer-panel__item-meta {
      display: flex;
      gap: 4px;
      margin-bottom: 2px;
    }
    .mockkit-sniffer-panel__tag {
      flex-shrink: 0;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.5;
    }
    .mockkit-sniffer-panel__tag--fetch {
      background: rgb(24 144 255 / 12%);
      color: #1890ff;
    }
    .mockkit-sniffer-panel__tag--xhr {
      background: rgb(194 61 92 / 12%);
      color: #c23d5c;
    }
    .mockkit-sniffer-panel__tag--method {
      background: rgb(213 99 33 / 12%);
      color: #d56321;
    }
    .mockkit-sniffer-panel__tag--ok {
      background: rgb(26 155 127 / 14%);
      color: #1a9b7f;
    }
    .mockkit-sniffer-panel__tag--err {
      background: rgb(245 34 45 / 12%);
      color: #f5222d;
    }
    .mockkit-sniffer-panel__tag--other {
      background: rgb(27 40 34 / 8%);
      color: rgb(27 40 34 / 55%);
    }
    .mockkit-sniffer-panel__url {
      display: block;
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: rgb(27 40 34 / 75%);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.4;
    }
    .mockkit-sniffer-panel__mock {
      flex-shrink: 0;
      border: 1px solid rgb(26 155 127 / 40%);
      border-radius: 7px;
      padding: 4px 10px;
      background: rgb(26 155 127 / 8%);
      cursor: pointer;
      color: #1a9b7f;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .mockkit-sniffer-panel__mock:hover {
      background: #1a9b7f;
      color: #fff;
    }
    .mockkit-sniffer-panel__empty {
      padding: 36px 16px;
      text-align: center;
      color: rgb(27 40 34 / 35%);
      font-size: 12px;
      line-height: 1.6;
    }
    /* Collapsed state: hide the toolbar + list, keep only the header bar. */
    .mockkit-sniffer-panel--collapsed {
      width: auto !important;
      max-height: none !important;
    }
    .mockkit-sniffer-panel--collapsed .mockkit-sniffer-panel__toolbar,
    .mockkit-sniffer-panel--collapsed .mockkit-sniffer-panel__list {
      display: none !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function bindSnifferPanelDrag(panel) {
  const header = panel.querySelector('.mockkit-sniffer-panel__header');
  if (!header || header.dataset.dragBound === '1') return;
  header.dataset.dragBound = '1';

  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let dragging = false;

  const onMove = (event) => {
    if (!dragging) return;
    const nextLeft = originLeft + (event.clientX - startX);
    const nextTop = originTop + (event.clientY - startY);
    const maxLeft = window.innerWidth - 60;
    const maxTop = window.innerHeight - 60;
    panel.style.setProperty('left', `${Math.max(0, Math.min(nextLeft, maxLeft))}px`, 'important');
    panel.style.setProperty('top', `${Math.max(0, Math.min(nextTop, maxTop))}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    header.classList.remove('mockkit-sniffer-panel__header--dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  header.addEventListener('mousedown', (event) => {
    if (event.target.closest('button')) return;
    dragging = true;
    ajaxToolsRuntimeState.snifferPanelDragged = true;
    header.classList.add('mockkit-sniffer-panel__header--dragging');
    const rect = panel.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    startX = event.clientX;
    startY = event.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    event.preventDefault();
  });
}

function createSnifferPanel() {
  if (snifferState.panelEl?.isConnected) return snifferState.panelEl;
  const existing = document.getElementById(SNIFFER_PANEL_ID);
  if (existing) {
    snifferState.panelEl = existing;
    return existing;
  }

  injectSnifferStyle();

  const panel = document.createElement('div');
  panel.className = 'mockkit-sniffer-panel';
  panel.id = SNIFFER_PANEL_ID;
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'mockkit-sniffer-panel__header';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'mockkit-sniffer-panel__title';
  const title = document.createElement('span');
  title.textContent = 'Request Sniffer';
  const countBadge = document.createElement('span');
  countBadge.className = 'mockkit-sniffer-panel__count';
  countBadge.textContent = '0';
  titleWrap.appendChild(title);
  titleWrap.appendChild(countBadge);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mockkit-sniffer-panel__close';
  closeBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  closeBtn.title = 'Hide sniffer panel';
  // Use setToolkitSnifferOpen(false) instead of setSnifferPanelVisible(false)
  // so the close button persists SNIFFER_OPEN_KEY=false to storage. Otherwise
  // a page refresh reads the stale true value and re-opens the sniffer.
  closeBtn.addEventListener('click', () => setToolkitSnifferOpen(false));
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'mockkit-sniffer-panel__close';
  collapseBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  collapseBtn.title = 'Collapse';
  collapseBtn.addEventListener('click', () => setSnifferPanelCollapsed(!snifferState.collapsed));
  header.appendChild(titleWrap);
  const headerActions = document.createElement('div');
  headerActions.style.display = 'flex';
  headerActions.style.gap = '2px';
  headerActions.appendChild(collapseBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(headerActions);
  panel.appendChild(header);

  const toolbar = document.createElement('div');
  toolbar.className = 'mockkit-sniffer-panel__toolbar';
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'mockkit-sniffer-panel__search';
  search.placeholder = 'Search url or method...';
  search.value = snifferState.keyword;
  search.addEventListener('input', () => {
    snifferState.keyword = search.value;
    renderSnifferList();
  });
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'mockkit-sniffer-panel__clear';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    snifferState.requests = [];
    renderSnifferList();
  });
  toolbar.appendChild(search);
  toolbar.appendChild(clearBtn);
  panel.appendChild(toolbar);

  const list = document.createElement('div');
  list.className = 'mockkit-sniffer-panel__list';
  panel.appendChild(list);

  bindSnifferPanelDrag(panel);
  snifferState.panelEl = panel;
  renderSnifferList();
  return panel;
}

// Filter the capture list by the current keyword (url or method substring).
function getFilteredSnifferRequests() {
  const trimmed = snifferState.keyword.trim().toLowerCase();
  if (!trimmed) return snifferState.requests;
  return snifferState.requests.filter(
    (item) => item.url.toLowerCase().includes(trimmed) || (item.method || '').toLowerCase().includes(trimmed)
  );
}

// Re-render the sniffer list body + count badge. Called whenever captures
// change or the search keyword updates.
function renderSnifferList() {
  const panel = snifferState.panelEl;
  if (!panel) return;
  const list = panel.querySelector('.mockkit-sniffer-panel__list');
  const countBadge = panel.querySelector('.mockkit-sniffer-panel__count');
  const clearBtn = panel.querySelector('.mockkit-sniffer-panel__clear');
  if (countBadge) countBadge.textContent = String(snifferState.requests.length);
  if (clearBtn) clearBtn.disabled = snifferState.requests.length === 0;
  if (!list) return;

  const filtered = getFilteredSnifferRequests();
  if (filtered.length === 0) {
    list.innerHTML = `<div class="mockkit-sniffer-panel__empty">${
      snifferState.requests.length === 0 ? 'No XHR captured yet' : 'No matches'
    }</div>`;
    return;
  }

  list.innerHTML = '';
  filtered.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'mockkit-sniffer-panel__item';

    const main = document.createElement('div');
    main.className = 'mockkit-sniffer-panel__item-main';

    const meta = document.createElement('div');
    meta.className = 'mockkit-sniffer-panel__item-meta';
    // Source tag (fetch / xhr)
    const sourceTag = document.createElement('span');
    sourceTag.className = `mockkit-sniffer-panel__tag mockkit-sniffer-panel__tag--${item.source}`;
    sourceTag.textContent = item.source;
    meta.appendChild(sourceTag);
    // Method tag
    if (item.method) {
      const methodTag = document.createElement('span');
      methodTag.className = 'mockkit-sniffer-panel__tag mockkit-sniffer-panel__tag--method';
      methodTag.textContent = item.method;
      meta.appendChild(methodTag);
    }
    // Status tag
    const statusTag = document.createElement('span');
    const statusOk = item.status >= 200 && item.status < 300;
    const statusErr = item.status >= 400;
    statusTag.className = `mockkit-sniffer-panel__tag mockkit-sniffer-panel__tag--${statusOk ? 'ok' : statusErr ? 'err' : 'other'}`;
    statusTag.textContent = String(item.status || '—');
    meta.appendChild(statusTag);
    main.appendChild(meta);

    const url = document.createElement('span');
    url.className = 'mockkit-sniffer-panel__url';
    url.textContent = item.url;
    url.title = item.url;
    main.appendChild(url);
    row.appendChild(main);

    // Mock button — posts the capture to the iframe so it can be promoted to
    // a rule in the currently selected group.
    const mockBtn = document.createElement('button');
    mockBtn.type = 'button';
    mockBtn.className = 'mockkit-sniffer-panel__mock';
    mockBtn.textContent = 'Mock';
    mockBtn.title = 'Add this request/response as a mock rule to the current group';
    mockBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const iframe = document.querySelector('.mockkit-interceptor-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'MOCKKIT_MOCK_CAPTURE',
          payload: {
            source: item.source,
            method: item.method,
            url: item.url,
            status: item.status,
            responseText: item.responseText,
          },
        }, '*');
      }
    });
    row.appendChild(mockBtn);
    list.appendChild(row);
  });
}

// Push a new capture into the ring buffer and re-render. Called from the
// AJAX_TOOLS_REQUEST_CAPTURED message handler.
function pushSnifferCapture(payload) {
  if (!payload || !payload.url) return;
  // Filter static assets — same logic as the iframe-side hook used to do.
  const STATIC_EXT_REGEX = /\.(js|css|mjs|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|otf|mp4|webm|mp3|wav|pdf|zip|tar|gz|wasm)(\?|$)/i;
  try {
    const path = payload.url.split('?')[0];
    if (STATIC_EXT_REGEX.test(path)) return;
  } catch (e) { /* ignore */ }

  const captured = {
    id: snifferState.nextId++,
    source: payload.source === 'fetch' ? 'fetch' : 'xhr',
    method: (payload.method || '').toUpperCase(),
    url: payload.url,
    status: typeof payload.status === 'number' ? payload.status : 0,
    responseText: typeof payload.responseText === 'string' ? payload.responseText : '',
    capturedAt: Date.now(),
  };
  snifferState.requests = [captured, ...snifferState.requests].slice(0, SNIFFER_MAX_CAPTURES);
  renderSnifferList();
}

function setSnifferPanelVisible(visible) {
  const panel = createSnifferPanel();
  snifferState.visible = visible;
  panel.style.display = visible ? 'flex' : 'none';
  if (visible) {
    repositionSnifferPanel();
    watchWorkbenchForFloatingOverlays();
  }
  // Keep the Toolkit panel's sniffer sub-toggle in sync.
  if (!visible && toolkitPanelState.snifferOpen) {
    toolkitPanelState.snifferOpen = false;
    syncToolkitPanelUi();
  }
  // Clear collapsed state when the panel is hidden so no dock chip lingers.
  if (!visible && snifferState.collapsed) {
    snifferState.collapsed = false;
    setPanelCollapsedInDock('sniffer', false);
  }
}

// Collapse/expand the sniffer panel. When collapsed, the panel hides entirely
// and a chip appears in the shared collapsed dock. Session-only state.
function setSnifferPanelCollapsed(collapsed) {
  snifferState.collapsed = collapsed;
  const panel = snifferState.panelEl;
  if (!panel) return;
  if (panel.style.display !== 'none') {
    panel.style.display = collapsed ? 'none' : 'flex';
  }
  setPanelCollapsedInDock('sniffer', collapsed);
}

// Toggle the sniffer sub-panel from the Toolkit master panel. Persists the
// open/closed state so a page refresh restores it (when Toolkit is on). Also
// mirrors snifferEnabled to the page script for state tracking. The Sniffer is
// subordinate to the Interceptor master switch — capture only works while the
// Interceptor is on (see syncHooks in pageScripts/index.js).
function setToolkitSnifferOpen(open) {
  toolkitPanelState.snifferOpen = open;
  setSnifferPanelVisible(open);
  syncToolkitPanelUi();
  if (chrome.storage?.local) {
    chrome.storage.local.set({ [SNIFFER_OPEN_KEY]: open });
  }
  // Mirror sniffer state to the page script. Hook installation is gated by
  // the Interceptor master switch, so capture only runs while it is on.
  postMessage({
    type: 'ajaxTools',
    to: 'pageScript',
    key: 'snifferEnabled',
    value: open,
  }, '*');
}

// Interceptor master switch OFF cascade: close the Sniffer panel (persisted
// closed + snifferEnabled mirrored false) and hide Floating Rules (persisted
// off via its own storage listener). Both stay off until manually re-enabled.
// Page Headers (DNR) are disabled separately by the service worker.
function disableSubFeaturesOnInterceptorOff() {
  setToolkitSnifferOpen(false);
  if (chrome.storage?.local) {
    chrome.storage.local.set({ [FLOATING_ENABLED_KEY]: false });
  }
}

// The sniffer panel defaults to the bottom-left anchor so it never overlaps
// Floating Rules (top-right), DOM Inspector (top-left), or Toolkit
// (bottom-right). Once the user drags it, auto-reposition leaves it alone.
function repositionSnifferPanel() {
  const panel = snifferState.panelEl;
  if (!panel || panel.style.display === 'none') return;
  if (ajaxToolsRuntimeState.snifferPanelDragged) return;
  // Reset to the CSS-defined default anchor (clear any inline positioning
  // so the !important base style takes over).
  panel.style.removeProperty('top');
  panel.style.removeProperty('right');
  panel.style.removeProperty('bottom');
  panel.style.removeProperty('left');
}

// --- Collapsed panels → Toolkit section ------------------------------------
// When a floating sub-panel (Animation / Sniffer / Rules) is collapsed, it
// hides entirely and a compact chip appears in a dedicated section at the
// bottom of the Toolkit master panel. Clicking the chip re-expands its panel.
// This keeps everything inside the single Toolkit entry — no separate dock
// element floating on the page.
// Registry of panels that can collapse into the Toolkit. Each entry maps a
// panel key to { label, icon, expand() }.
const collapsedPanelRegistry = {
  animation: { label: 'Animation', icon: '✨', expand: () => setAnimationPanelCollapsed(false) },
  sniffer: { label: 'Sniffer', icon: '📡', expand: () => setSnifferPanelCollapsed(false) },
};
let collapsedPanelState = {
  // Set of panel keys currently shown as chips in the Toolkit section.
  collapsed: new Set(),
};

// Mark a panel as collapsed (shows its chip in the Toolkit) or expanded
// (removes its chip). Called by each panel's setCollapsed function.
function setPanelCollapsedInDock(key, collapsed) {
  if (collapsed) {
    collapsedPanelState.collapsed.add(key);
  } else {
    collapsedPanelState.collapsed.delete(key);
  }
  renderCollapsedSection();
}

// Rebuild the collapsed-section chip list inside the Toolkit panel. The
// section is hidden when no panels are collapsed.
function renderCollapsedSection() {
  const toolkitPanel = toolkitPanelState.panelEl;
  if (!toolkitPanel) return;
  let section = toolkitPanel.querySelector('.mockkit-toolkit-panel__collapsed');
  if (collapsedPanelState.collapsed.size === 0) {
    if (section) section.remove();
    return;
  }
  if (!section) {
    section = document.createElement('div');
    section.className = 'mockkit-toolkit-panel__collapsed';
    toolkitPanel.appendChild(section);
  }
  section.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'mockkit-toolkit-panel__collapsed-title';
  title.textContent = 'Collapsed';
  section.appendChild(title);
  const chipRow = document.createElement('div');
  chipRow.className = 'mockkit-toolkit-panel__collapsed-chips';
  collapsedPanelState.collapsed.forEach((key) => {
    const entry = collapsedPanelRegistry[key];
    if (!entry) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mockkit-toolkit-panel__collapsed-chip';
    chip.title = `Expand ${entry.label}`;
    chip.innerHTML = `<span class="mockkit-toolkit-panel__collapsed-chip-icon">${entry.icon}</span><span>${entry.label}</span>`;
    chip.addEventListener('click', () => entry.expand());
    chipRow.appendChild(chip);
  });
  section.appendChild(chipRow);
}


// A single draggable bottom-right panel that consolidates the auxiliary debug
// tools: Floating Rules, DOM Inspect, Animation Control. It replaces the old
// standalone floating-rules panel as the primary floating entry — the rules
// list now lives inside it as a collapsible sub-section, toggled by the
// "Floating Rules" row. This gives a single source of truth for which debug
// overlays are active and keeps the mock layer as the workbench's focus.
const TOOLKIT_PANEL_ID = 'mockkit-toolkit-panel';
const TOOLKIT_VISIBLE_KEY = 'ajaxToolsToolkitPanelVisible';
let toolkitPanelState = {
  panelEl: null,
  visible: false,
  collapsed: false,
  // Sub-tool visibility: when true, the corresponding sub-panel/overlay shows.
  rulesOpen: false,
  animationOpen: false,
  snifferOpen: false,
};

function injectToolkitStyle() {
  if (document.getElementById('mockkit-toolkit-style')) return;
  const style = document.createElement('style');
  style.id = 'mockkit-toolkit-style';
  style.textContent = `
    .mockkit-toolkit-panel {
      position: fixed !important;
      right: 24px !important;
      bottom: 24px !important;
      width: 280px !important;
      display: none;
      flex-direction: column;
      z-index: 2147483646 !important;
      border: 1px solid rgb(27 40 34 / 8%) !important;
      border-radius: 16px !important;
      box-shadow: 0 20px 60px rgb(37 54 46 / 18%), 0 4px 12px rgb(37 54 46 / 8%) !important;
      background: linear-gradient(160deg, rgb(255 255 255 / 96%), rgb(248 245 238 / 94%)) !important;
      backdrop-filter: blur(20px);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #1b2822;
      transition: box-shadow 0.2s ease, right 0.3s ease;
    }
    .mockkit-toolkit-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgb(27 40 34 / 6%);
      font-weight: 700;
      font-size: 13px;
      background: linear-gradient(135deg, rgb(255 255 255 / 80%), rgb(247 244 236 / 70%));
      flex-shrink: 0;
      cursor: grab;
      user-select: none;
      letter-spacing: 0.02em;
    }
    .mockkit-toolkit-panel__header--dragging {
      cursor: grabbing;
      background: linear-gradient(135deg, rgb(26 155 127 / 6%), rgb(247 244 236 / 70%));
    }
    .mockkit-toolkit-panel__title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mockkit-toolkit-panel__title::before {
      content: '';
      width: 6px; height: 6px; border-radius: 999px;
      background: #1a9b7f; flex-shrink: 0;
    }
    .mockkit-toolkit-panel__close {
      flex-shrink: 0;
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 8px;
      background: transparent; cursor: pointer;
      color: rgb(27 40 34 / 40%); line-height: 1;
      transition: all 0.15s ease;
      padding: 0;
    }
    .mockkit-toolkit-panel__close svg {
      width: 14px; height: 14px;
      display: block;
    }
    .mockkit-toolkit-panel__close:hover {
      background: rgb(27 40 34 / 6%);
      color: rgb(27 40 34 / 70%);
    }
    .mockkit-toolkit-panel__body {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .mockkit-toolkit-panel__tool {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      transition: background 0.15s ease;
    }
    .mockkit-toolkit-panel__tool:hover {
      background: rgb(26 155 127 / 5%);
    }
    .mockkit-toolkit-panel__tool-icon {
      flex-shrink: 0;
      width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 7px;
      background: rgb(26 155 127 / 8%);
      color: #1a9b7f;
    }
    .mockkit-toolkit-panel__tool-icon svg {
      width: 14px; height: 14px;
    }
    .mockkit-toolkit-panel__tool-name {
      flex: 1;
      min-width: 0;
      font-weight: 600;
      font-size: 12px;
    }
    .mockkit-toolkit-panel__tool-hint {
      display: block;
      font-weight: 400;
      font-size: 10px;
      color: rgb(27 40 34 / 45%);
      margin-top: 1px;
    }
    .mockkit-toolkit-panel__tool-btn {
      flex-shrink: 0;
      border: 1px solid rgb(26 155 127 / 30%);
      border-radius: 7px;
      padding: 4px 10px;
      background: #fff;
      cursor: pointer;
      color: #1a9b7f;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .mockkit-toolkit-panel__tool-btn:hover {
      background: rgb(26 155 127 / 12%);
    }
    .mockkit-toolkit-panel__tool-switch {
      position: relative;
      width: 36px; height: 20px; border-radius: 999px;
      border: none; cursor: pointer; padding: 0;
      background: rgb(27 40 34 / 22%);
      transition: background 0.2s ease;
      flex-shrink: 0;
    }
    .mockkit-toolkit-panel__tool-switch::after {
      content: '';
      position: absolute; top: 2px; left: 2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
      transition: transform 0.2s ease;
    }
    .mockkit-toolkit-panel__tool-switch.is-on {
      background: #1a9b7f;
    }
    .mockkit-toolkit-panel__tool-switch.is-on::after {
      transform: translateX(16px);
    }
    /* Collapsed (compact) state: a minimal circular dot — no title, no
       buttons, no chrome. Click the dot to expand. Visibility is
       controlled by the workbench Toolkit switch. */
    .mockkit-toolkit-panel--collapsed {
      width: 36px !important;
      height: 36px !important;
      border-radius: 50% !important;
      padding: 0 !important;
    }
    .mockkit-toolkit-panel--collapsed .mockkit-toolkit-panel__body {
      display: none !important;
    }
    .mockkit-toolkit-panel--collapsed .mockkit-toolkit-panel__header-actions {
      display: none !important;
    }
    .mockkit-toolkit-panel--collapsed .mockkit-toolkit-panel__title {
      display: none !important;
    }
    .mockkit-toolkit-panel--collapsed .mockkit-toolkit-panel__header {
      cursor: pointer;
      padding: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      border-bottom: none;
    }
    .mockkit-toolkit-panel--collapsed .mockkit-toolkit-panel__header::after {
      content: '';
      width: 10px; height: 10px; border-radius: 50%;
      background: #1a9b7f;
      flex-shrink: 0;
    }
    /* Collapsed-panels section: chips for sub-panels that were minimized. Sits
       at the bottom of the Toolkit panel, below the tool rows. */
    .mockkit-toolkit-panel__collapsed {
      padding: 10px 12px 12px;
      border-top: 1px solid rgb(27 40 34 / 6%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }
    .mockkit-toolkit-panel__collapsed-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgb(27 40 34 / 40%);
    }
    .mockkit-toolkit-panel__collapsed-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .mockkit-toolkit-panel__collapsed-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid rgb(26 155 127 / 25%);
      background: rgb(26 155 127 / 6%);
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      color: #1a9b7f;
      transition: all 0.15s ease;
    }
    .mockkit-toolkit-panel__collapsed-chip:hover {
      background: #1a9b7f;
      color: #fff;
      border-color: #1a9b7f;
    }
    .mockkit-toolkit-panel__collapsed-chip-icon {
      font-size: 12px;
      line-height: 1;
    }
    /* When the floating rules sub-panel is open inside the Toolkit, we hide the
       standalone floating-rules panel (it is rendered separately at the DOM
       level for reuse of the existing renderFloatingRules logic). The Toolkit
       positions itself above it. */
    .mockkit-toolkit-panel__rules-section {
      display: none;
      border-top: 1px solid rgb(27 40 34 / 6%);
    }
    .mockkit-toolkit-panel__rules-section.is-open {
      display: block;
    }
  `;
  document.documentElement.appendChild(style);
}

// Drag the Toolkit panel by its header. Position kept in memory only.
function bindToolkitPanelDrag(panel) {
  const header = panel.querySelector('.mockkit-toolkit-panel__header');
  if (!header || header.dataset.dragBound === '1') return;
  header.dataset.dragBound = '1';

  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let dragging = false;
  let moved = false;

  const onMove = (event) => {
    if (!dragging) return;
    moved = true;
    const nextLeft = originLeft + (event.clientX - startX);
    const nextTop = originTop + (event.clientY - startY);
    const maxLeft = window.innerWidth - 60;
    const maxTop = window.innerHeight - 60;
    panel.style.setProperty('left', `${Math.max(0, Math.min(nextLeft, maxLeft))}px`, 'important');
    panel.style.setProperty('top', `${Math.max(0, Math.min(nextTop, maxTop))}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    header.classList.remove('mockkit-toolkit-panel__header--dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    // Suppress the click that follows a real drag so dragging the compact
    // pill never toggles expand.
    if (moved) {
      panel.dataset.toolkitDragged = '1';
      window.setTimeout(() => { panel.dataset.toolkitDragged = ''; }, 60);
    }
    moved = false;
  };

  header.addEventListener('mousedown', (event) => {
    if (event.target.closest('button')) return;
    // The collapsed dot is locked to the default anchor — do not start a
    // drag. Click (not drag) expands it; see header click handler.
    if (toolkitPanelState.collapsed) return;
    dragging = true;
    moved = false;
    ajaxToolsRuntimeState.toolkitPanelDragged = true;
    header.classList.add('mockkit-toolkit-panel__header--dragging');
    const rect = panel.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    startX = event.clientX;
    startY = event.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    event.preventDefault();
  });
}

function createToolkitPanel() {
  if (toolkitPanelState.panelEl?.isConnected) {
    return toolkitPanelState.panelEl;
  }
  const existing = document.getElementById(TOOLKIT_PANEL_ID);
  if (existing) {
    toolkitPanelState.panelEl = existing;
    return existing;
  }

  injectToolkitStyle();

  const panel = document.createElement('div');
  panel.className = 'mockkit-toolkit-panel';
  panel.id = TOOLKIT_PANEL_ID;
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'mockkit-toolkit-panel__header';
  const title = document.createElement('span');
  title.className = 'mockkit-toolkit-panel__title';
  title.textContent = 'Toolkit';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'mockkit-toolkit-panel__close';
  collapseBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  collapseBtn.title = 'Collapse';
  collapseBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setToolkitPanelCollapsed(!toolkitPanelState.collapsed);
  });
  header.appendChild(title);
  const headerActions = document.createElement('div');
  headerActions.className = 'mockkit-toolkit-panel__header-actions';
  headerActions.appendChild(collapseBtn);
  header.appendChild(headerActions);
  // Click the header (not a button) to expand when collapsed. A real drag
  // sets panel.dataset.toolkitDragged to suppress this click (see
  // bindToolkitPanelDrag) so dragging the compact pill never toggles expand.
  header.addEventListener('click', () => {
    if (toolkitPanelState.collapsed && panel.dataset.toolkitDragged !== '1') {
      setToolkitPanelCollapsed(false);
    }
  });
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'mockkit-toolkit-panel__body';

  // Tool 1: Floating Rules — toggle shows/hides the rules list sub-panel.
  const rulesRow = document.createElement('div');
  rulesRow.className = 'mockkit-toolkit-panel__tool';
  const rulesIcon = document.createElement('span');
  rulesIcon.className = 'mockkit-toolkit-panel__tool-icon';
  rulesIcon.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 3h10v6a5 5 0 01-10 0V3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const rulesName = document.createElement('span');
  rulesName.className = 'mockkit-toolkit-panel__tool-name';
  rulesName.textContent = 'Floating Rules';
  const rulesHint = document.createElement('span');
  rulesHint.className = 'mockkit-toolkit-panel__tool-hint';
  rulesHint.textContent = 'Mock rule list';
  rulesName.appendChild(rulesHint);
  const rulesSwitch = document.createElement('button');
  rulesSwitch.type = 'button';
  rulesSwitch.className = 'mockkit-toolkit-panel__tool-switch';
  rulesSwitch.title = 'Show/hide the floating rules list';
  rulesSwitch.addEventListener('click', () => {
    const open = !toolkitPanelState.rulesOpen;
    setToolkitRulesOpen(open);
    // Auto-minimize Toolkit when a sub-panel opens so the master panel gets
    // out of the way once a sub-tool is on screen. Skipped on the restore
    // path (setToolkitPanelVisible re-open) because that calls setToolkit*
    // directly, not this click handler.
    if (open) autoCollapseToolkitForSubPanel();
  });
  rulesRow.appendChild(rulesIcon);
  rulesRow.appendChild(rulesName);
  rulesRow.appendChild(rulesSwitch);
  body.appendChild(rulesRow);

  // Tool 2: DOM Inspect — one-shot button, triggers pick mode.
  const inspectRow = document.createElement('div');
  inspectRow.className = 'mockkit-toolkit-panel__tool';
  const inspectIcon = document.createElement('span');
  inspectIcon.className = 'mockkit-toolkit-panel__tool-icon';
  inspectIcon.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 2l4.5 11 1.8-4.2L13.5 7 3 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/></svg>';
  const inspectName = document.createElement('span');
  inspectName.className = 'mockkit-toolkit-panel__tool-name';
  inspectName.textContent = 'DOM Inspect';
  const inspectHint = document.createElement('span');
  inspectHint.className = 'mockkit-toolkit-panel__tool-hint';
  inspectHint.textContent = 'Pick a node to inspect';
  inspectName.appendChild(inspectHint);
  const inspectBtn = document.createElement('button');
  inspectBtn.type = 'button';
  inspectBtn.className = 'mockkit-toolkit-panel__tool-btn';
  inspectBtn.textContent = 'Inspect';
  inspectBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (domInspectorState.active && domInspectorState.mode !== 'inspect') {
      stopDomInspector();
    }
    startDomInspector();
  });
  inspectRow.appendChild(inspectIcon);
  inspectRow.appendChild(inspectName);
  inspectRow.appendChild(inspectBtn);
  body.appendChild(inspectRow);

  // Tool 3: Animation Control — toggle shows/hides the animation popup.
  const animRow = document.createElement('div');
  animRow.className = 'mockkit-toolkit-panel__tool';
  const animIcon = document.createElement('span');
  animIcon.className = 'mockkit-toolkit-panel__tool-icon';
  animIcon.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
  const animName = document.createElement('span');
  animName.className = 'mockkit-toolkit-panel__tool-name';
  animName.textContent = 'Animation Control';
  const animHint = document.createElement('span');
  animHint.className = 'mockkit-toolkit-panel__tool-hint';
  animHint.textContent = 'Pause / speed (⌘⇧K / ⌘⇧X)';
  animName.appendChild(animHint);
  const animSwitch = document.createElement('button');
  animSwitch.type = 'button';
  animSwitch.className = 'mockkit-toolkit-panel__tool-switch';
  animSwitch.title = 'Show/hide the animation control popup';
  animSwitch.addEventListener('click', () => {
    const open = !toolkitPanelState.animationOpen;
    setToolkitAnimationOpen(open);
    if (open) autoCollapseToolkitForSubPanel();
  });
  animRow.appendChild(animIcon);
  animRow.appendChild(animName);
  animRow.appendChild(animSwitch);
  body.appendChild(animRow);

  // Tool 4: Request Sniffer — toggle shows/hides the live-capture panel.
  const snifferRow = document.createElement('div');
  snifferRow.className = 'mockkit-toolkit-panel__tool';
  const snifferIcon = document.createElement('span');
  snifferIcon.className = 'mockkit-toolkit-panel__tool-icon';
  snifferIcon.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M2 8h2M12 8h2M8 2v2M8 12v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const snifferName = document.createElement('span');
  snifferName.className = 'mockkit-toolkit-panel__tool-name';
  snifferName.textContent = 'Request Sniffer';
  const snifferHint = document.createElement('span');
  snifferHint.className = 'mockkit-toolkit-panel__tool-hint';
  snifferHint.textContent = 'Live XHR/fetch capture → mock';
  snifferName.appendChild(snifferHint);
  const snifferSwitch = document.createElement('button');
  snifferSwitch.type = 'button';
  snifferSwitch.className = 'mockkit-toolkit-panel__tool-switch';
  snifferSwitch.title = 'Show/hide the request sniffer panel';
  snifferSwitch.addEventListener('click', () => {
    const open = !toolkitPanelState.snifferOpen;
    setToolkitSnifferOpen(open);
    if (open) autoCollapseToolkitForSubPanel();
  });
  snifferRow.appendChild(snifferIcon);
  snifferRow.appendChild(snifferName);
  snifferRow.appendChild(snifferSwitch);
  body.appendChild(snifferRow);

  panel.appendChild(body);
  bindToolkitPanelDrag(panel);
  toolkitPanelState.panelEl = panel;
  syncToolkitPanelUi();
  return panel;
}

// Reflect Toolkit sub-tool states into the panel DOM (switches + hints).
function syncToolkitPanelUi() {
  const panel = toolkitPanelState.panelEl;
  if (!panel) return;
  const switches = panel.querySelectorAll('.mockkit-toolkit-panel__tool-switch');
  if (switches[0]) switches[0].classList.toggle('is-on', toolkitPanelState.rulesOpen);
  if (switches[1]) switches[1].classList.toggle('is-on', toolkitPanelState.animationOpen);
  if (switches[2]) switches[2].classList.toggle('is-on', toolkitPanelState.snifferOpen);
}

// Show/hide the Toolkit master panel. Persists to storage so the workbench's
// Toolkit switch stays in sync across reloads and iframe re-mounts. When
// shown, restores each sub-tool's last persisted open state (rules, sniffer).
// When hidden, hides all sub-panels too — Toolkit is their only entry.
function setToolkitPanelVisible(visible) {
  const panel = createToolkitPanel();
  toolkitPanelState.visible = visible;
  panel.style.display = visible ? 'flex' : 'none';
  if (visible) {
    repositionToolkitPanel();
    watchWorkbenchForFloatingOverlays();
    // Restore each sub-tool's open state. The hide path preserves intent
    // (the *Open flags + persisted storage keys) without destroying it, so
    // re-opening Toolkit brings back whatever sub-panels were on. Guards
    // check ACTUAL panel visibility (not the intent flags) so a forced-true
    // flag from the hide path can't mask a still-hidden panel.
    chrome.storage.local.get([FLOATING_ENABLED_KEY, SNIFFER_OPEN_KEY], (result) => {
      if (result[FLOATING_ENABLED_KEY] === true && !ajaxToolsRuntimeState.floatingRulesEnabled) {
        setToolkitRulesOpen(true);
      }
      if (result[SNIFFER_OPEN_KEY] === true && !snifferState.visible) {
        setToolkitSnifferOpen(true);
      }
    });
    // Animation has no persisted state — restore from the in-memory intent flag.
    if (toolkitPanelState.animationOpen && animationControlState.panelEl?.style.display === 'none') {
      setToolkitAnimationOpen(true);
    }
  } else {
    // Hiding the Toolkit panel hides ALL sub-panels — Toolkit is their only
    // entry point. Sub-tool open INTENT is preserved (not reset) so re-opening
    // Toolkit restores them. We do NOT write storage=false for rules/sniffer
    // because that would destroy the persisted intent the show path reads back.
    if (toolkitPanelState.rulesOpen) {
      // Hide the rules panel without destroying intent: flip the runtime flag
      // off (applyFloatingPanelState reads it) but keep rulesOpen=true and do
      // NOT persist FLOATING_ENABLED_KEY=false.
      ajaxToolsRuntimeState.floatingRulesEnabled = false;
      applyFloatingPanelState();
    }
    if (toolkitPanelState.snifferOpen) {
      setSnifferPanelVisible(false);
      // Keep snifferOpen flag true so re-opening Toolkit restores it.
      toolkitPanelState.snifferOpen = true;
    }
    if (toolkitPanelState.animationOpen) {
      setAnimationPanelVisible(false);
      toolkitPanelState.animationOpen = true;
    }
    // Reset collapsed state so re-opening shows the panel expanded.
    if (toolkitPanelState.collapsed) {
      toolkitPanelState.collapsed = false;
      const panel = toolkitPanelState.panelEl;
      if (panel) panel.classList.remove('mockkit-toolkit-panel--collapsed');
    }
    syncToolkitPanelUi();
  }
  // Persist so the Global Controls Toolkit switch reflects the right state.
  if (chrome.storage?.local) {
    chrome.storage.local.set({ [TOOLKIT_VISIBLE_KEY]: visible });
  }
  // Rules panel is independent of Toolkit — no reposition needed here.
}

// Collapse/expand the Toolkit master panel. Toolkit is the host — it does NOT
// collapse into a chip (only sub-panels do). When collapsed, it shrinks to a
// 36px circular dot. Both collapsed and expanded states anchor to the CSS
// default (right:24px; bottom:24px) — the panel does NOT remember a drag
// position across collapse/expand, so toggling never lands it off-screen.
// Drag is allowed in the expanded state only; the collapsed dot is locked to
// the default anchor so its position is always predictable.
function setToolkitPanelCollapsed(collapsed) {
  toolkitPanelState.collapsed = collapsed;
  const panel = toolkitPanelState.panelEl;
  if (!panel) return;
  // Clear ALL inline positioning so the panel falls back to the CSS default
  // anchor (right:24px; bottom:24px) in both directions. This guarantees a
  // predictable position regardless of prior drags.
  panel.style.removeProperty('left');
  panel.style.removeProperty('top');
  panel.style.removeProperty('right');
  panel.style.removeProperty('bottom');
  // Reset the dragged flag so a future drag starts fresh from the default
  // anchor (otherwise bindToolkitPanelDrag's mousedown would read the stale
  // pre-collapse rect).
  ajaxToolsRuntimeState.toolkitPanelDragged = false;
  panel.classList.toggle('mockkit-toolkit-panel--collapsed', collapsed);
}

// Auto-minimize the Toolkit master panel when a sub-panel (Rules / Animation /
// Sniffer) opens, so the expanded Toolkit no longer dominates the viewport
// once a sub-tool is on screen. No-op if Toolkit is already collapsed or not
// visible. Only called from the sub-tool switch click handlers (user action),
// never from the restore path — so re-opening Toolkit leaves it expanded.
function autoCollapseToolkitForSubPanel() {
  if (!toolkitPanelState.visible) return;
  if (toolkitPanelState.collapsed) return;
  setToolkitPanelCollapsed(true);
}

// Toggle the rules sub-panel. Reuses the existing floating-rules panel DOM:
// when opened, the rules panel is shown anchored just above the Toolkit panel;
// when closed, it is hidden. The rules panel keeps its own renderFloatingRules
// logic intact.
function setToolkitRulesOpen(open) {
  toolkitPanelState.rulesOpen = open;
  // Defer to the existing floating-rules panel machinery. We drive its enabled
  // state through the same storage key so the workbench switch stays in sync.
  ajaxToolsRuntimeState.floatingRulesEnabled = open;
  if (chrome.storage?.local) {
    chrome.storage.local.set({ [FLOATING_ENABLED_KEY]: open });
  }
  applyFloatingPanelState();
  syncToolkitPanelUi();
}

// Toggle the animation sub-panel.
function setToolkitAnimationOpen(open) {
  toolkitPanelState.animationOpen = open;
  setAnimationPanelVisible(open);
  syncToolkitPanelUi();
}

// The Toolkit panel holds its ground when the workbench opens — it floats
// above the workbench via z-index instead of dodging left.
function repositionToolkitPanel() {
  const panel = toolkitPanelState.panelEl;
  if (!panel || panel.style.display === 'none') return;
}

// Listen for the workbench iframe asking to toggle the Toolkit panel.
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'MOCKKIT_TOGGLE_TOOLKIT_PANEL') return;
  const willShow = !toolkitPanelState.visible;
  setToolkitPanelVisible(willShow);
});


// Tooltip suppression: a session-only toggle that freezes both JS-driven
// tooltips (Ant Design / MUI / hover libraries that listen on mouseover /
// mouseenter / focus / focusin) AND native title tooltips. Useful while
// inspecting a dense UI where tooltips keep occluding the target node.
//
// Mechanism:
//  - Capture-phase listeners on `document` stop propagation of mouseover,
//    mouseenter, mouseout, mouseleave, focus, focusin — so tooltip libraries
//    never see the hover/focus events that trigger their show logic.
//  - `mousemove` is intentionally NOT blocked (the DOM Inspector needs it).
//  - Native `title` attributes are temporarily blanked (original stored in a
//    WeakMap) so the browser's built-in tooltip doesn't show either.
//
// Toggle via the animation pause action (⌘⇧K or the Pause button) — freezing
// animations also freezes tooltips so a paused page is fully frozen. No
// separate toggle; resuming animations also resumes tooltips.
let tooltipSuppressed = false;
// Elements whose `title` we blanked (so we can restore on disable without a
// full-document query). Using a Set instead of WeakMap because we need
// iteration on restore.
const tooltipBlankedElements = new Set();

function tooltipEventHandler(event) {
  // Stop the event from reaching tooltip libraries, but do NOT preventDefault
  // — default actions (focus, etc.) are still allowed so the page keeps
  // working; only the tooltip-triggering listeners are skipped.
  event.stopPropagation();
}

const TOOLTIP_BLOCKED_EVENTS = ['mouseover', 'mouseenter', 'mouseout', 'mouseleave', 'focus', 'focusin'];

function setTooltipSuppressed(suppress) {
  if (suppress === tooltipSuppressed) return;
  tooltipSuppressed = suppress;
  if (suppress) {
    // Block hover/focus events at capture phase so tooltip libraries never
    // receive them.
    TOOLTIP_BLOCKED_EVENTS.forEach((type) => {
      document.addEventListener(type, tooltipEventHandler, true);
    });
    // Blank existing native titles so the browser tooltip doesn't fire.
    // New elements added during suppression are NOT covered (acceptable —
    // native titles are rare in modern app UIs).
    const titled = document.querySelectorAll('[title]');
    titled.forEach((el) => {
      const original = el.getAttribute('title');
      if (original != null) {
        el.setAttribute('data-mockkit-title', original);
        el.removeAttribute('title');
        tooltipBlankedElements.add(el);
      }
    });
  } else {
    TOOLTIP_BLOCKED_EVENTS.forEach((type) => {
      document.removeEventListener(type, tooltipEventHandler, true);
    });
    // Restore native titles — only the elements we blanked.
    tooltipBlankedElements.forEach((el) => {
      if (el.isConnected) {
        const original = el.getAttribute('data-mockkit-title');
        if (original != null) {
          el.setAttribute('title', original);
          el.removeAttribute('data-mockkit-title');
        }
      }
    });
    tooltipBlankedElements.clear();
  }
  // Visual feedback via a transient badge so the user knows the state.
  showTooltipSuppressBadge(tooltipSuppressed);
  // Sync the Animation Control panel so the pause button reflects the new
  // state (tooltip suppression is tied to the pause action).
  syncAnimationPanelUi();
}

// Transient on-screen badge confirming the toggle state (auto-dismisses).
// Shown when pause is toggled (animations + tooltips freeze together).
function showTooltipSuppressBadge(suppressed) {
  const id = 'mockkit-tooltip-badge';
  let badge = document.getElementById(id);
  if (badge) badge.remove();
  badge = document.createElement('div');
  badge.id = id;
  badge.textContent = suppressed ? 'Paused (⌘⇧K to resume)' : 'Resumed';
  badge.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:24px',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'padding:6px 14px',
    'border-radius:8px',
    'font:600 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'color:#fff',
    'background:#374151',
    'box-shadow:0 4px 16px rgb(0 0 0 / 25%)',
    'pointer-events:none',
    'transition:opacity 0.3s ease',
  ].join(';');
  (document.documentElement || document.body).appendChild(badge);
  setTimeout(() => {
    badge.style.opacity = '0';
    setTimeout(() => badge.remove(), 300);
  }, 1200);
}


// A top-right floating popup that drives every page animation through the Web
// Animations API: pause/resume and scrub playback rate, so keyframes can be
// inspected at a controlled pace. Session-only state (never persisted) so a
// forgotten toggle cannot freeze animations on the next visit. Keyboard
// shortcuts stay active while the master toggle is on, even if the popup is
// hidden. The popup sits one z-index tier below the main workbench, so when the
// workbench slides open it covers the popup's top-right anchor; drag the popup
// or close the workbench to interact with it again.
const ANIMATION_SPEED_CYCLE = [1, 2, 4, 0.5];
const ANIMATION_STYLE_ID = 'mockkit-animation-control-style';
let animationControlState = {
  panelEl: null,        // popup root element
  enabled: false,       // master toggle — when true, animations are coerced
  paused: false,        // whether animations are force-paused
  speedIndex: 0,        // index into ANIMATION_SPEED_CYCLE
  originalStates: null, // WeakMap<Animation, { rate, playState }> for restore
  pollTimer: null,      // interval id that re-applies control to new animations
  styleObserver: null,  // MutationObserver on the workbench container (reposition)
  keyListenerBound: false,
  collapsed: false,     // when true, only the header bar is visible
};

function getAnimationSpeed() {
  return ANIMATION_SPEED_CYCLE[animationControlState.speedIndex];
}

// Inject the popup stylesheet once. Uses a dedicated <style> element (not the
// shared injectedStyle helper, which dedupes to a single global style block).
function injectAnimationStyle() {
  if (document.getElementById(ANIMATION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ANIMATION_STYLE_ID;
  style.textContent = `
    .mockkit-animation-control {
      position: fixed !important;
      top: 24px !important;
      right: 24px !important;
      width: 232px !important;
      display: none;
      flex-direction: column;
      z-index: 2147483646 !important;
      border: 1px solid rgb(124 58 237 / 22%) !important;
      border-radius: 16px !important;
      box-shadow: 0 20px 60px rgb(37 54 46 / 18%), 0 4px 12px rgb(37 54 46 / 8%) !important;
      background: linear-gradient(160deg, rgb(255 255 255 / 96%), rgb(245 243 255 / 94%)) !important;
      backdrop-filter: blur(20px);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #1b2822;
      transition: right 0.3s ease;
    }
    .mockkit-animation-control__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 14px;
      border-bottom: 1px solid rgb(124 58 237 / 10%);
      font-weight: 700;
      font-size: 13px;
      background: linear-gradient(135deg, rgb(255 255 255 / 80%), rgb(247 243 255 / 70%));
      flex-shrink: 0;
      user-select: none;
      letter-spacing: 0.02em;
    }
    .mockkit-animation-control__title { display: flex; align-items: center; gap: 6px; }
    .mockkit-animation-control__title::before {
      content: '';
      width: 6px; height: 6px; border-radius: 999px;
      background: #7c3aed; flex-shrink: 0;
    }
    .mockkit-animation-control__close {
      flex-shrink: 0;
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 8px;
      background: transparent; cursor: pointer;
      color: rgb(27 40 34 / 40%); line-height: 1;
      transition: all 0.15s ease;
      padding: 0;
    }
    .mockkit-animation-control__close svg {
      width: 14px; height: 14px;
      display: block;
    }
    .mockkit-animation-control__close:hover { background: rgb(124 58 237 / 12%); color: #7c3aed; }
    .mockkit-animation-control__body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 12px; }
    .mockkit-animation-control__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .mockkit-animation-control__label { font-weight: 600; font-size: 12px; }
    .mockkit-animation-control__switch {
      position: relative;
      width: 38px; height: 22px; border-radius: 999px;
      border: none; cursor: pointer; padding: 0;
      background: rgb(27 40 34 / 22%);
      transition: background 0.2s ease;
      flex-shrink: 0;
    }
    .mockkit-animation-control__switch::after {
      content: '';
      position: absolute; top: 2px; left: 2px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
      transition: transform 0.2s ease;
    }
    .mockkit-animation-control__switch.is-on { background: #7c3aed; }
    .mockkit-animation-control__switch.is-on::after { transform: translateX(16px); }
    .mockkit-animation-control__pause {
      flex: 1;
      border: 1px solid rgb(124 58 237 / 30%);
      border-radius: 8px;
      padding: 7px 10px;
      background: #fff;
      cursor: pointer;
      font-size: 12px; font-weight: 600;
      color: #7c3aed;
      transition: all 0.15s ease;
    }
    .mockkit-animation-control__pause:hover { background: rgb(124 58 237 / 10%); }
    .mockkit-animation-control__pause:disabled { opacity: 0.4; cursor: not-allowed; }
    .mockkit-animation-control__pause.is-paused { background: #7c3aed; color: #fff; border-color: #7c3aed; }
    .mockkit-animation-control__speeds { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .mockkit-animation-control__speed {
      border: 1px solid rgb(27 40 34 / 12%);
      border-radius: 8px;
      padding: 6px 0;
      background: #fff;
      cursor: pointer;
      font-size: 12px; font-weight: 600;
      color: rgb(27 40 34 / 65%);
      transition: all 0.15s ease;
    }
    .mockkit-animation-control__speed:hover:not(:disabled) { border-color: rgb(124 58 237 / 45%); color: #7c3aed; }
    .mockkit-animation-control__speed:disabled { opacity: 0.4; cursor: not-allowed; }
    .mockkit-animation-control__speed.is-active { background: #7c3aed; color: #fff; border-color: #7c3aed; }
    .mockkit-animation-control__status {
      font-size: 11px; font-weight: 600;
      color: rgb(27 40 34 / 55%);
      padding: 4px 8px; border-radius: 999px;
      background: rgb(27 40 34 / 5%);
      text-align: center;
    }
    .mockkit-animation-control__status.is-on { background: rgb(124 58 237 / 12%); color: #7c3aed; }
    .mockkit-animation-control__hint {
      font-size: 10.5px; line-height: 1.5;
      color: rgb(27 40 34 / 45%);
      border-top: 1px solid rgb(27 40 34 / 6%);
      padding-top: 10px;
    }
    .mockkit-animation-control__hint kbd {
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      padding: 1px 4px; border-radius: 4px;
      background: rgb(27 40 34 / 6%);
      border: 1px solid rgb(27 40 34 / 10%);
    }
    /* Collapsed state: hide the body, keep only the header bar. */
    .mockkit-animation-control--collapsed {
      width: auto !important;
    }
    .mockkit-animation-control--collapsed .mockkit-animation-control__body {
      display: none !important;
    }
  `;
  document.documentElement.appendChild(style);
}

// Cache and override every live animation to reflect the current control
// state. Safe to call repeatedly: each animation's original state is cached
// only once, so later passes merely re-assert the desired rate/playState.
function applyAnimationControl() {
  if (!animationControlState.enabled) return;
  if (!animationControlState.originalStates) {
    animationControlState.originalStates = new WeakMap();
  }
  const speed = getAnimationSpeed();
  // document.getAnimations() covers CSS animations, CSS transitions, and
  // element.animate() instances — everything the page is currently animating.
  const animations = document.getAnimations();
  for (const anim of animations) {
    if (!animationControlState.originalStates.has(anim)) {
      // Capture the page's original intent before any override, so disable can
      // restore it verbatim (including a CSS-paused animation staying paused).
      animationControlState.originalStates.set(anim, {
        rate: anim.playbackRate,
        playState: anim.playState,
      });
    }
    const original = animationControlState.originalStates.get(anim);
    // Effective rate multiplies the original, preserving author intent while
    // letting the user scrub faster or slower for keyframe inspection.
    anim.playbackRate = original.rate * speed;
    if (animationControlState.paused) {
      anim.pause();
    } else {
      // Don't replay animations that were already finished/idle when captured —
      // calling play() on them would restart from the beginning, which is a
      // surprising side effect for a debug toggle.
      if (original.playState !== 'finished' && original.playState !== 'idle') {
        anim.play();
      }
    }
  }
}

// Restore every controlled animation to its pre-control state.
function restoreAnimations() {
  if (!animationControlState.originalStates) return;
  const animations = document.getAnimations();
  for (const anim of animations) {
    const original = animationControlState.originalStates.get(anim);
    if (!original) continue;
    anim.playbackRate = original.rate;
    // Only touch playState for animations that were actively playing or
    // explicitly paused. Finished/idle ones are left untouched so we never
    // accidentally replay them on restore.
    if (original.playState === 'paused') {
      anim.pause();
    } else if (original.playState !== 'finished' && original.playState !== 'idle') {
      anim.play();
    }
  }
  animationControlState.originalStates = null;
}

function setAnimationEnabled(next) {
  animationControlState.enabled = next;
  if (next) {
    applyAnimationControl();
    // Poll for animations created AFTER enable (CSS animations triggered by
    // later interactions, lazy element.animate calls, etc.). 800ms is cheap
    // enough not to burden the page while debugging.
    if (!animationControlState.pollTimer) {
      animationControlState.pollTimer = setInterval(applyAnimationControl, 800);
    }
  } else {
    if (animationControlState.pollTimer) {
      clearInterval(animationControlState.pollTimer);
      animationControlState.pollTimer = null;
    }
    restoreAnimations();
    // Ensure the rAF patch is lifted when control is fully disabled, so the
    // page's JS animation loops resume even if pause was left on.
    if (animationControlState.paused) {
      animationControlState.paused = false;
    }
    postMessage({
      type: 'ajaxTools',
      to: 'pageScript',
      key: 'animationPaused',
      value: false,
    }, '*');
    // Lift tooltip suppression too so disabling control fully restores the
    // page to its original interactive state.
    setTooltipSuppressed(false);
  }
  syncAnimationPanelUi();
}

function setAnimationPaused(next) {
  animationControlState.paused = next;
  applyAnimationControl();
  // Relay to the page script so JS-driven (rAF) animation loops are also
  // frozen/resumed. WAAPI only covers CSS animations/transitions; without
  // this, canvas/WebGL/GSAP/React-rAF animations would keep playing.
  postMessage({
    type: 'ajaxTools',
    to: 'pageScript',
    key: 'animationPaused',
    value: next,
  }, '*');
  // Freeze/resume tooltips together with animations so a paused page is
  // fully frozen — no animated tooltips occluding the inspected node.
  setTooltipSuppressed(next);
  syncAnimationPanelUi();
}

function cycleAnimationSpeed() {
  animationControlState.speedIndex = (animationControlState.speedIndex + 1) % ANIMATION_SPEED_CYCLE.length;
  applyAnimationControl();
  syncAnimationPanelUi();
}

function setAnimationSpeedIndex(index) {
  animationControlState.speedIndex = index;
  applyAnimationControl();
  syncAnimationPanelUi();
}

// Reflect the current state into the popup DOM. Queries by class so it
// survives panel rebuilds (same pattern as syncInspectorEntryButtons).
function syncAnimationPanelUi() {
  const panel = animationControlState.panelEl;
  if (!panel) return;
  const body = panel.querySelector('.mockkit-animation-control__body');
  if (body) body.classList.toggle('is-enabled', animationControlState.enabled);

  const sw = panel.querySelector('.mockkit-animation-control__switch');
  if (sw) sw.classList.toggle('is-on', animationControlState.enabled);

  const pauseBtn = panel.querySelector('.mockkit-animation-control__pause');
  if (pauseBtn) {
    pauseBtn.textContent = animationControlState.paused ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('is-paused', animationControlState.paused);
    pauseBtn.disabled = !animationControlState.enabled;
  }

  const speedBtns = panel.querySelectorAll('.mockkit-animation-control__speed');
  speedBtns.forEach((btn) => {
    const val = Number(btn.dataset.speed);
    btn.classList.toggle('is-active', val === getAnimationSpeed());
    btn.disabled = !animationControlState.enabled;
  });

  const status = panel.querySelector('.mockkit-animation-control__status');
  if (status) {
    const label = animationControlState.enabled
      ? (animationControlState.paused ? 'Paused' : `${getAnimationSpeed()}×`)
      : 'Off';
    status.textContent = label;
    status.classList.toggle('is-on', animationControlState.enabled);
  }
}

// The animation popup stays anchored to the top-right corner regardless of
// whether the workbench is open. It sits one z-index tier below the workbench,
// so the workbench covers it when both are visible — drag the popup or close
// the workbench to reach it.
function repositionAnimationPanel() {
  const panel = animationControlState.panelEl;
  if (!panel || panel.style.display === 'none') return;
  panel.style.right = '24px';
}

// Rules panel positioning is fully independent of every other floating
// overlay (Toolkit, Sniffer, Animation, workbench). It stays at its default
// top-right anchor (right:24px, top:24px from CSS) and only moves when the
// user drags it (floatingPanelDragged). Repositioning clears any inline
// overrides so the !important base style takes over.
function repositionFloatingRulesPanel() {
  const panel = ajaxToolsRuntimeState.floatingPanel;
  if (!panel || panel.style.display === 'none') return;
  if (ajaxToolsRuntimeState.floatingPanelDragged) return;
  // Reset to the CSS-defined default anchor (clear any inline bottom set by
  // legacy stacking logic so the !important base style takes over).
  panel.style.removeProperty('bottom');
  panel.style.removeProperty('left');
  panel.style.removeProperty('top');
  panel.style.removeProperty('right');
}

// Reposition every floating overlay (Rules, Sniffer, Animation, Toolkit).
// Overlays sit one z-index tier BELOW the workbench so the main plugin panel
// is never obscured; where an overlay does not overlap the workbench it stays
// visible. Called by the workbench style/class observer and on resize.
function repositionFloatingOverlays() {
  repositionToolkitPanel();
  repositionAnimationPanel();
  repositionFloatingRulesPanel();
  repositionSnifferPanel();
}

// Watch the workbench container's inline style (transform toggles on open/close)
// and reposition the floating overlays in lockstep. Registered once, on first
// show of either overlay.
function watchWorkbenchForFloatingOverlays() {
  if (animationControlState.styleObserver) return;
  const container = ajaxToolsRuntimeState.panelContainer;
  if (!container) return;
  animationControlState.styleObserver = new MutationObserver(repositionFloatingOverlays);
  animationControlState.styleObserver.observe(container, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
  window.addEventListener('resize', repositionFloatingOverlays);
}

function setAnimationPanelVisible(visible) {
  const panel = createAnimationControlPanel();
  panel.style.display = visible ? 'flex' : 'none';
  if (visible) {
    repositionAnimationPanel();
    watchWorkbenchForFloatingOverlays();
  }
  // Keep the Toolkit panel's Animation toggle in sync when the popup is
  // dismissed via its own close button (×) or the ⌘⇧K/⌘⇧X shortcuts.
  if (!visible && toolkitPanelState.animationOpen) {
    toolkitPanelState.animationOpen = false;
    syncToolkitPanelUi();
  }
  // Clear collapsed state when the panel is hidden so no dock chip lingers.
  if (!visible && animationControlState.collapsed) {
    animationControlState.collapsed = false;
    setPanelCollapsedInDock('animation', false);
  }
}

// Collapse/expand the animation popup. When collapsed, the panel hides
// entirely and a chip appears in the shared collapsed dock. Session-only state.
function setAnimationPanelCollapsed(collapsed) {
  animationControlState.collapsed = collapsed;
  const panel = animationControlState.panelEl;
  if (!panel) return;
  // Only hide when the panel is currently visible (display !== 'none').
  if (panel.style.display !== 'none') {
    panel.style.display = collapsed ? 'none' : 'flex';
  }
  setPanelCollapsedInDock('animation', collapsed);
}

function createAnimationControlPanel() {
  if (animationControlState.panelEl?.isConnected) {
    return animationControlState.panelEl;
  }
  const existing = document.getElementById('mockkit-animation-control');
  if (existing) {
    animationControlState.panelEl = existing;
    return existing;
  }

  injectAnimationStyle();

  const panel = document.createElement('div');
  panel.className = 'mockkit-animation-control';
  panel.id = 'mockkit-animation-control';
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'mockkit-animation-control__header';
  const title = document.createElement('span');
  title.className = 'mockkit-animation-control__title';
  title.textContent = 'Animation Control';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mockkit-animation-control__close';
  closeBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  closeBtn.title = 'Hide popup (animation state is kept)';
  closeBtn.addEventListener('click', () => setAnimationPanelVisible(false));
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'mockkit-animation-control__close';
  collapseBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  collapseBtn.title = 'Collapse';
  collapseBtn.addEventListener('click', () => setAnimationPanelCollapsed(!animationControlState.collapsed));
  header.appendChild(title);
  const headerActions = document.createElement('div');
  headerActions.style.display = 'flex';
  headerActions.style.gap = '2px';
  headerActions.appendChild(collapseBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(headerActions);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'mockkit-animation-control__body';

  // Enable row: master toggle. While off, all other controls are disabled.
  const enableRow = document.createElement('div');
  enableRow.className = 'mockkit-animation-control__row';
  const enableLabel = document.createElement('span');
  enableLabel.className = 'mockkit-animation-control__label';
  enableLabel.textContent = 'Enable Control';
  const enableSwitch = document.createElement('button');
  enableSwitch.type = 'button';
  enableSwitch.className = 'mockkit-animation-control__switch';
  enableSwitch.title = 'Take over page animations';
  enableSwitch.addEventListener('click', () => setAnimationEnabled(!animationControlState.enabled));
  enableRow.appendChild(enableLabel);
  enableRow.appendChild(enableSwitch);
  body.appendChild(enableRow);

  // Pause row: freeze/resume all animations at once.
  const pauseRow = document.createElement('div');
  pauseRow.className = 'mockkit-animation-control__row';
  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.className = 'mockkit-animation-control__pause';
  pauseBtn.textContent = 'Pause';
  pauseBtn.addEventListener('click', () => setAnimationPaused(!animationControlState.paused));
  pauseRow.appendChild(pauseBtn);
  body.appendChild(pauseRow);

  // Speed row: direct selection of a fixed gear.
  const speedRow = document.createElement('div');
  speedRow.className = 'mockkit-animation-control__row';
  const speedLabel = document.createElement('span');
  speedLabel.className = 'mockkit-animation-control__label';
  speedLabel.textContent = 'Speed';
  speedRow.appendChild(speedLabel);
  body.appendChild(speedRow);
  const speeds = document.createElement('div');
  speeds.className = 'mockkit-animation-control__speeds';
  ANIMATION_SPEED_CYCLE.forEach((value, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mockkit-animation-control__speed';
    btn.dataset.speed = String(value);
    btn.textContent = `${value}×`;
    btn.addEventListener('click', () => setAnimationSpeedIndex(index));
    speeds.appendChild(btn);
  });
  body.appendChild(speeds);

  // Status pill: at-a-glance current state.
  const status = document.createElement('div');
  status.className = 'mockkit-animation-control__status';
  status.textContent = 'Off';
  body.appendChild(status);

  // Shortcut hint.
  const hint = document.createElement('div');
  hint.className = 'mockkit-animation-control__hint';
  hint.innerHTML = `<kbd>⌘⇧K</kbd> pause/resume &nbsp; <kbd>⌘⇧X</kbd> cycle speed`;
  body.appendChild(hint);

  panel.appendChild(body);
  animationControlState.panelEl = panel;
  syncAnimationPanelUi();
  return panel;
}

// Global keyboard shortcuts. Self-gate on the master toggle so they are inert
// when control is off. Registered once (top frame only).
function onAnimationControlKeydown(event) {
  if (!animationControlState.enabled) return;
  const target = event.target;
  // Don't hijack shortcuts while the user is typing in a form field.
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  if (!(event.metaKey && event.shiftKey)) return;
  const key = event.key;
  // ⌘⇧K → toggle pause/resume
  if (key === 'K' || key === 'k') {
    event.preventDefault();
    setAnimationPaused(!animationControlState.paused);
    return;
  }
  // ⌘⇧X → cycle playback speed through the fixed gears
  if (key === 'X' || key === 'x') {
    event.preventDefault();
    cycleAnimationSpeed();
    return;
  }
}

if (window.self === window.top && !animationControlState.keyListenerBound) {
  animationControlState.keyListenerBound = true;
  document.addEventListener('keydown', onAnimationControlKeydown, true);
}

function mountPanelContainer() {
  if (window.self !== window.top) {
    return true;
  }

  const mountTarget = document.body || document.documentElement;
  if (!mountTarget) {
    return false;
  }

  const container = createPanelContainer();
  bindPanelMessageListener(container);

  if (!container.isConnected) {
    mountTarget.appendChild(container);
  }

  // Mount the Animation Control popup (Toolkit sub-tool). Hidden by default;
  // shown on demand from the Toolkit panel's Animation toggle. Mounted in the
  // top frame only (mountPanelContainer early-returns in subframes).
  const animationPanel = createAnimationControlPanel();
  if (!animationPanel.isConnected) {
    mountTarget.appendChild(animationPanel);
  }

  // Mount the Toolkit master panel (consolidates Floating Rules / DOM Inspect /
  // Animation Control / Request Sniffer into one draggable bottom-right panel).
  // Hidden by default; shown on demand from the OperationsRail "Toolkit" switch.
  const toolkitPanel = createToolkitPanel();
  if (!toolkitPanel.isConnected) {
    mountTarget.appendChild(toolkitPanel);
  }
  // Hydrate Toolkit visibility from storage so the panel re-appears after a
  // page reload if the user left it on. Defaults to COLLAPSED on refresh so
  // the expanded panel doesn't dominate the viewport on first paint — the
  // user clicks the dot to expand. Sub-panels still restore to their prior
  // open state (driven by the show path inside setToolkitPanelVisible).
  chrome.storage.local.get([TOOLKIT_VISIBLE_KEY], (result) => {
    if (result[TOOLKIT_VISIBLE_KEY] === true) {
      setToolkitPanelVisible(true);
      setToolkitPanelCollapsed(true);
    }
  });

  // Mount the Request Sniffer panel (Toolkit sub-tool). Hidden by default;
  // shown on demand from the Toolkit panel's Sniffer toggle.
  const snifferPanel = createSnifferPanel();
  if (!snifferPanel.isConnected) {
    mountTarget.appendChild(snifferPanel);
  }

  // Mount the floating rules panel LAST so it stacks above all other
  // top-right overlays (Sniffer/Animation) at the same z-index. Its
  // positioning is fully independent — default top-right anchor, only
  // moves when the user drags it.
  const floatingPanel = createFloatingRulesPanel();
  if (!floatingPanel.isConnected) {
    mountTarget.appendChild(floatingPanel);
  }
  loadFloatingRulesState(() => renderFloatingRules());

  // Watch the workbench's open/close transitions + window resize so floating
  // overlays can reposition themselves (reset to default anchor unless
  // dragged). Overlays sit one z-index tier below the workbench, so the panel
  // is never obscured; the hook is kept for resize repositioning.
  watchWorkbenchForFloatingOverlays();
  repositionFloatingOverlays();

  if (ajaxToolsRuntimeState.panelMountObserver) {
    ajaxToolsRuntimeState.panelMountObserver.disconnect();
    ajaxToolsRuntimeState.panelMountObserver = null;
  }

  return true;
}

function initPanelMount() {
  const tryMountPanel = () => {
    if (document.readyState === 'loading') {
      return;
    }
    mountPanelContainer();
  };

  tryMountPanel();
  document.addEventListener('readystatechange', tryMountPanel);

  if (!ajaxToolsRuntimeState.panelContainer?.isConnected) {
    // Some sites replace document.body during bootstrap, so retry until a mount target is stable.
    ajaxToolsRuntimeState.panelMountObserver = new MutationObserver(() => {
      if (mountPanelContainer()) {
        ajaxToolsRuntimeState.panelMountObserver?.disconnect();
        ajaxToolsRuntimeState.panelMountObserver = null;
      }
    });
    ajaxToolsRuntimeState.panelMountObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
}

if (window.self === window.top && !ajaxToolsRuntimeState.panelInitBound) {
  ajaxToolsRuntimeState.panelInitBound = true;
  initPanelMount();
}

chrome.storage.onChanged.addListener(function (changes, namespace) {
  for (let [key, {oldValue, newValue}] of Object.entries(changes)) {
    if (
      key === 'ajaxDataList'
      || key === 'ajaxToolsSwitchOn'
      || key === 'ajaxToolsSwitchOnNot200'
    ) {
      // 发送到pageScript/index
      postMessage({
        type: 'ajaxTools',
        to: 'pageScript',
        key,
        value: newValue,
      }, '*');
    }
    // Interceptor is the master switch. Forward to the page script and mirror
    // locally. When it turns OFF, force-disable every mock sub-feature owned by
    // the content script (Sniffer + Floating Rules); Page Headers (DNR) are
    // handled by the service worker. Sub-features stay off after the Interceptor
    // is re-enabled — each must be re-toggled manually.
    if (key === 'ajaxToolsSwitchOn') {
      ajaxToolsRuntimeState.ajaxToolsSwitchOn = newValue !== false;
      applyFloatingPanelState();
      if (newValue === false) {
        disableSubFeaturesOnInterceptorOff();
      }
    }
    // Domain whitelist: forward to the page script so the mock layer can
    // gate XHR/fetch override, and update the floating panel visibility.
    if (key === 'ajaxToolsDomainWhitelist') {
      const next = Array.isArray(newValue) && newValue.length > 0 ? newValue : ['*'];
      ajaxToolsRuntimeState.domainWhitelist = next;
      applyFloatingPanelState();
      postMessage({
        type: 'ajaxTools',
        to: 'pageScript',
        key: 'domainWhitelist',
        value: next,
      }, '*');
    }
    // Re-render the floating rules panel when rule data or the selected
    // group changes so it stays in sync with the React workbench.
    if (key === 'ajaxDataList' || key === FLOATING_SELECTED_GROUP_KEY) {
      renderFloatingRules();
    }
    // Master toggle for the floating panel — react immediately so the
    // panel appears/disappears even when the main side panel is closed.
    if (key === FLOATING_ENABLED_KEY) {
      ajaxToolsRuntimeState.floatingRulesEnabled = newValue !== false;
      applyFloatingPanelState();
      // Mirror into the Toolkit panel's rules sub-toggle so the switch stays
      // in sync when the state is changed from elsewhere (e.g. the workbench's
      // legacy Floating Rules switch, if still wired).
      toolkitPanelState.rulesOpen = newValue !== false;
      syncToolkitPanelUi();
    }
    // Toolkit master panel visibility — driven by the Global Controls Toolkit
    // switch in the workbench. Show/hide the Toolkit panel accordingly.
    if (key === TOOLKIT_VISIBLE_KEY) {
      setToolkitPanelVisible(newValue === true);
    }
    // Sniffer sub-toggle persistence — only meaningful when Toolkit is on.
    // If Toolkit is visible, reflect the state into the sniffer panel.
    if (key === SNIFFER_OPEN_KEY && toolkitPanelState.visible) {
      const open = newValue === true;
      if (open !== toolkitPanelState.snifferOpen) {
        setToolkitSnifferOpen(open);
      }
    }
  }
});
