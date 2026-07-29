
const AJAX_TOOLS_RUNTIME_STATE_KEY = '__ajaxToolsRuntimeState__';
const AJAX_TOOLS_STYLE_ID = 'mockkit-interceptor-runtime-style';

const ajaxToolsRuntimeState = window[AJAX_TOOLS_RUNTIME_STATE_KEY] || (window[AJAX_TOOLS_RUNTIME_STATE_KEY] = {
  panelContainer: null,
  panelMessageListenerBound: false,
  panelMountObserver: null,
  panelInitBound: false,
  floatingPanel: null,
  floatingPanelBound: false,
  floatingRulesEnabled: true,
  floatingRulesCollapsed: false,
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
    bottom: 24px !important;
    width: 340px !important;
    max-height: 440px !important;
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
    border: none;
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
    color: #1b2822;
  }
  .mockkit-floating-rules__csr-btn--on {
    background: rgb(26 155 127 / 14%);
    color: #1a9b7f;
  }
  .mockkit-floating-rules__csr-btn--on:hover {
    background: rgb(26 155 127 / 22%);
    color: #1a9b7f;
  }
  .mockkit-floating-rules__csr-btn:hover {
    border-color: rgb(27 40 34 / 24%);
    color: rgb(27 40 34 / 75%);
  }
  .mockkit-floating-rules__csr-btn--on {
    background: linear-gradient(135deg, #1a9b7f, rgb(26 155 127 / 85%));
    border-color: #1a9b7f;
    color: #fff;
    box-shadow: 0 2px 8px rgb(26 155 127 / 30%);
  }
  .mockkit-floating-rules__csr-btn--on:hover {
    color: #fff;
    border-color: #1a9b7f;
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
  .mockkit-floating-rules__collapse-btn {
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
    font-size: 16px;
    line-height: 1;
    transition: all 0.15s ease;
  }
  .mockkit-floating-rules__collapse-btn:hover {
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
  /* Collapsed state: shrink to a compact mock grid widget. */
  .mockkit-floating-rules--collapsed {
    width: auto !important;
    max-height: none !important;
    padding: 10px !important;
    border-radius: 14px !important;
  }
  .mockkit-floating-rules--collapsed .mockkit-floating-rules__header,
  .mockkit-floating-rules--collapsed .mockkit-floating-rules__list {
    display: none !important;
  }
  .mockkit-floating-rules__mock {
    display: none;
    cursor: pointer;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 2px;
    transition: transform 0.15s ease;
  }
  .mockkit-floating-rules__mock:hover {
    transform: scale(1.05);
  }
  .mockkit-floating-rules--collapsed .mockkit-floating-rules__mock {
    display: flex;
  }
  .mockkit-floating-rules__mock-grid {
    display: grid;
    grid-template-columns: repeat(3, 9px);
    grid-auto-rows: 9px;
    gap: 3px;
  }
  .mockkit-floating-rules__mock-cell {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    background: rgb(27 40 34 / 8%);
    transition: background 0.2s ease;
  }
  .mockkit-floating-rules__mock-cell--on {
    background: #1a9b7f;
    box-shadow: 0 0 4px rgb(26 155 127 / 40%);
  }
  .mockkit-floating-rules__mock-cell--off {
    background: rgb(27 40 34 / 20%);
  }
  .mockkit-floating-rules__mock-count {
    font-size: 10px;
    font-weight: 700;
    color: #1b2822;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
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
  }

  /* DOM Inspector result panel: top-left so it never overlaps the rules
     floating panel anchored bottom-right. */
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
  .mockkit-dom-inspector__reinspect svg {
    width: 13px;
    height: 13px;
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
  .mockkit-dom-inspector__size {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgb(27 40 34 / 6%);
    color: rgb(27 40 34 / 65%);
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
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
    background: #f7f4ec;
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
  .mockkit-dom-inspector__summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 10px;
  }
  .mockkit-dom-inspector__summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border-radius: 8px;
    background: #f7f4ec;
  }
  .mockkit-dom-inspector__summary-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgb(27 40 34 / 45%);
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
`);

let domInspectorState = {
  active: false,
  overlay: null,
  overlayLabel: null,
  panel: null,
  lastTarget: null,
};

function createDomInspectorOverlay() {
  if (domInspectorState.overlay) return domInspectorState.overlay;
  const overlay = document.createElement('div');
  overlay.className = 'mockkit-dom-inspector-overlay';
  document.body.appendChild(overlay);
  domInspectorState.overlay = overlay;

  // Info label that floats next to the highlight box, showing the element's
  // selector + size — mirrors the Chrome DevTools inspect behavior.
  const label = document.createElement('div');
  label.className = 'mockkit-dom-inspector-overlay__label';
  document.body.appendChild(label);
  domInspectorState.overlayLabel = label;

  return overlay;
}

function destroyDomInspectorOverlay() {
  if (domInspectorState.overlay) {
    domInspectorState.overlay.remove();
    domInspectorState.overlay = null;
  }
  if (domInspectorState.overlayLabel) {
    domInspectorState.overlayLabel.remove();
    domInspectorState.overlayLabel = null;
  }
}

function startDomInspector() {
  if (domInspectorState.active) return;
  domInspectorState.active = true;
  createDomInspectorOverlay();

  const onMove = (event) => {
    if (!domInspectorState.active) return;
    // Temporarily hide overlay so elementFromPoint hits the real target.
    const overlay = domInspectorState.overlay;
    if (overlay) overlay.style.display = 'none';
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (overlay) overlay.style.display = 'block';
    if (!target || target === domInspectorState.panel) return;

    domInspectorState.lastTarget = target;
    const rect = target.getBoundingClientRect();
    if (overlay) {
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.display = 'block';
    }
    // Position the info label at the top-right corner of the highlight box.
    const label = domInspectorState.overlayLabel;
    if (label) {
      const { tag, id, classes } = describeDomNode(target);
      const shortSelector = `${tag}${id ? `#${id}` : ''}${classes.length ? `.${classes[0]}` : ''}`;
      label.textContent = `${shortSelector}  ${Math.round(rect.width)}×${Math.round(rect.height)}`;
      // Place above the box if there's room; otherwise below it.
      const labelTop = rect.top > 20 ? rect.top - 20 : rect.bottom + 4;
      label.style.left = `${rect.left}px`;
      label.style.top = `${labelTop}px`;
      label.style.display = 'block';
    }
  };

  const onClick = (event) => {
    if (!domInspectorState.active) return;
    if (domInspectorState.panel && domInspectorState.panel.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = domInspectorState.lastTarget || event.target;
    if (!target || target === domInspectorState.panel) return;
    pickDomNode(target);
    stopDomInspector();
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

  // Show a hint panel while picking.
  showDomInspectorPanel(null, 'Move your mouse over the page and click a node to inspect. Press Esc to cancel.');
}

function stopDomInspector() {
  if (!domInspectorState.active) return;
  domInspectorState.active = false;
  if (domInspectorState.onMove) document.removeEventListener('mousemove', domInspectorState.onMove, true);
  if (domInspectorState.onClick) document.removeEventListener('click', domInspectorState.onClick, true);
  if (domInspectorState.onKey) document.removeEventListener('keydown', domInspectorState.onKey, true);
  destroyDomInspectorOverlay();
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
// Only color properties and Size get editors; Border Width is display-only.
const SUMMARY_STYLE_MAP = {
  'Color': 'color',
  'Background': 'backgroundColor',
  'Border Color': 'borderColor',
  'Size': '', // handled specially (width × height)
};

// Build a single summary card with click-to-copy AND inline editing.
// Color items render a native color picker; text items render a text input.
// Edits apply live to the inspected node's inline style.
function buildSummaryItem(label, value, swatchColor, colorMode, node) {
  const item = document.createElement('div');
  item.className = 'mockkit-dom-inspector__summary-item';
  const labelEl = document.createElement('span');
  labelEl.className = 'mockkit-dom-inspector__summary-label';
  labelEl.textContent = label;
  item.appendChild(labelEl);

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
  item.appendChild(valueEl);

  // --- Inline editor (below the value) ---
  if (node && SUMMARY_STYLE_MAP[label] !== undefined) {
    const editorRow = document.createElement('div');
    editorRow.style.cssText = 'margin-top:4px;';

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

    item.appendChild(editorRow);
  }

  return item;
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
    startDomInspector();
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mockkit-dom-inspector__close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
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
    const rect = node.getBoundingClientRect();
    const sizeText = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

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

    const sizeEl = document.createElement('span');
    sizeEl.className = 'mockkit-dom-inspector__size';
    sizeEl.textContent = sizeText;
    tagRow.appendChild(sizeEl);

    body.appendChild(tagRow);

    // Summary: always-visible grid of the most-used properties.
    // Color items support rgb/hex toggle and click-to-copy.
    const core = readCoreStyles(node);
    if (core) {
      // Color mode toggle button (RGB / HEX), placed above the summary grid.
      const colorModeRow = document.createElement('div');
      colorModeRow.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:6px;';
      const colorToggle = document.createElement('button');
      colorToggle.type = 'button';
      colorToggle.className = 'mockkit-dom-inspector__color-toggle';
      let colorMode = 'rgb'; // getComputedStyle returns rgb by default
      colorToggle.textContent = `Color: ${colorMode.toUpperCase()} ⇄`;
      colorModeRow.appendChild(colorToggle);
      body.appendChild(colorModeRow);

      const summary = document.createElement('div');
      summary.className = 'mockkit-dom-inspector__summary';
      summary.appendChild(buildSummaryItem('Size', `${core.width} × ${core.height}`, null, colorMode, node));
      summary.appendChild(buildSummaryItem('Color', core.color, core.color, colorMode, node));
      summary.appendChild(buildSummaryItem('Background', core.backgroundColor, core.backgroundColor, colorMode, node));
      summary.appendChild(buildSummaryItem('Border Width', core.borderWidth, null, colorMode, null));
      summary.appendChild(buildSummaryItem('Border Color', core.borderColor, core.borderColor, colorMode, node));
      body.appendChild(summary);

      // Toggle re-renders the summary grid with the new color format.
      colorToggle.addEventListener('click', () => {
        colorMode = colorMode === 'rgb' ? 'hex' : 'rgb';
        colorToggle.textContent = `Color: ${colorMode.toUpperCase()} ⇄`;
        summary.innerHTML = '';
        summary.appendChild(buildSummaryItem('Size', `${core.width} × ${core.height}`, null, colorMode, node));
        summary.appendChild(buildSummaryItem('Color', core.color, core.color, colorMode, node));
        summary.appendChild(buildSummaryItem('Background', core.backgroundColor, core.backgroundColor, colorMode, node));
        summary.appendChild(buildSummaryItem('Border Width', core.borderWidth, null, colorMode, null));
        summary.appendChild(buildSummaryItem('Border Color', core.borderColor, core.borderColor, colorMode, node));
      });
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

  panel.appendChild(body);
  document.body.appendChild(panel);
  domInspectorState.panel = panel;

  // Enable drag on the header (position kept in memory only).
  bindDomInspectorDrag(panel, header);
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
  startDomInspector();
});
injectedCss('icons/iconfont/iconfont.css');
injectedScript('html/iframePage/mock.js');
const pageScripts = injectedScript('pageScripts/index.js');
if (pageScripts) {
  pageScripts.addEventListener('load', () => {
    chrome.storage.local.get(['iframeVisible', 'ajaxToolsSwitchOn', 'ajaxToolsSwitchOnNot200', 'ajaxDataList', 'ajaxToolsSkin', 'ajaxToolsDomainWhitelist'], (result) => {
      // console.log('【ajaxTools content.js】【storage】', result);
      const {ajaxToolsSwitchOn = true, ajaxToolsSwitchOnNot200 = true, ajaxDataList = []} = result;
      const domainWhitelist = Array.isArray(result.ajaxToolsDomainWhitelist) && result.ajaxToolsDomainWhitelist.length > 0
        ? result.ajaxToolsDomainWhitelist
        : ['*'];
      ajaxToolsRuntimeState.domainWhitelist = domainWhitelist;
      // Keep the runtime mirror of the global interceptor switch in sync so
      // applyFloatingPanelState() can hide the floating panel when paused.
      ajaxToolsRuntimeState.ajaxToolsSwitchOn = ajaxToolsSwitchOn;
      applyFloatingPanelState();
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxDataList', value: ajaxDataList});
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxToolsSwitchOn', value: ajaxToolsSwitchOn});
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxToolsSwitchOnNot200', value: ajaxToolsSwitchOnNot200});
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'domainWhitelist', value: domainWhitelist});
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
  const closeBtn = closeButton(container);
  left.appendChild(closeBtn);
  const fullscreenBtn = fullscreenButton(container);
  left.appendChild(fullscreenBtn);
  header.appendChild(left);
  // right: theme mode
  const right = document.createElement('div');
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
const FLOATING_COLLAPSED_KEY = 'ajaxToolsFloatingRulesCollapsed';

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
  const panel = ajaxToolsRuntimeState.floatingPanel;
  if (!panel) return;

  // Never show the floating panel on hostnames the user did not allowlist.
  if (!currentHostWhitelisted()) {
    panel.style.display = 'none';
    return;
  }

  // Hide the floating panel when the global interceptor switch is off —
  // without interception active, the panel's toggles have no effect, so
  // showing it would be misleading.
  if (!ajaxToolsRuntimeState.ajaxToolsSwitchOn) {
    panel.style.display = 'none';
    return;
  }

  if (!ajaxToolsRuntimeState.floatingRulesEnabled) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  panel.classList.toggle(
    'mockkit-floating-rules--collapsed',
    ajaxToolsRuntimeState.floatingRulesCollapsed
  );
}

function loadFloatingRulesState(callback) {
  chrome.storage.local.get([FLOATING_ENABLED_KEY, FLOATING_COLLAPSED_KEY], (result) => {
    ajaxToolsRuntimeState.floatingRulesEnabled = result[FLOATING_ENABLED_KEY] !== false;
    ajaxToolsRuntimeState.floatingRulesCollapsed = result[FLOATING_COLLAPSED_KEY] === true;
    applyFloatingPanelState();
    if (typeof callback === 'function') callback();
  });
}

function toggleFloatingRulesCollapsed() {
  const next = !ajaxToolsRuntimeState.floatingRulesCollapsed;
  ajaxToolsRuntimeState.floatingRulesCollapsed = next;
  applyFloatingPanelState();
  chrome.storage.local.set({ [FLOATING_COLLAPSED_KEY]: next });
}

// Drag the floating panel by its header. Position is kept in memory only —
// a page refresh resets it to the default bottom-right corner.
function bindFloatingPanelDrag(panel) {
  const header = panel.querySelector('.mockkit-floating-rules__header');
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
    header.classList.remove('mockkit-floating-rules__header--dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  header.addEventListener('mousedown', (event) => {
    // Ignore drag when clicking on buttons (collapse / csr) inside the header.
    if (event.target.closest('button')) return;
    dragging = true;
    header.classList.add('mockkit-floating-rules__header--dragging');
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
    startDomInspector();
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

    // Render the collapsed mock grid: a 3x3 cell matrix visualizing rule
    // states (green = enabled, gray = disabled, faint = empty slot) plus an
    // enabled/total counter. Shown only when the panel is collapsed.
    const mockGridEl = panel.querySelector('.mockkit-floating-rules__mock-grid');
    const mockCountEl = panel.querySelector('.mockkit-floating-rules__mock-count');
    if (mockGridEl) {
      mockGridEl.innerHTML = '';
      const enabledCount = interfaceList.filter((r) => r.open !== false).length;
      for (let i = 0; i < 9; i += 1) {
        const cell = document.createElement('span');
        cell.className = 'mockkit-floating-rules__mock-cell';
        const rule = interfaceList[i];
        if (rule) {
          cell.classList.add(
            rule.open !== false
              ? 'mockkit-floating-rules__mock-cell--on'
              : 'mockkit-floating-rules__mock-cell--off'
          );
        }
        mockGridEl.appendChild(cell);
      }
    }
    if (mockCountEl) {
      const enabledCount = interfaceList.filter((r) => r.open !== false).length;
      mockCountEl.textContent = `${enabledCount}/${interfaceList.length}`;
    }

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
  collapseBtn.className = 'mockkit-floating-rules__collapse-btn';
  collapseBtn.type = 'button';
  collapseBtn.title = 'Collapse';
  collapseBtn.textContent = '—';
  collapseBtn.addEventListener('click', toggleFloatingRulesCollapsed);
  headerActions.appendChild(collapseBtn);
  header.appendChild(headerActions);
  panel.appendChild(header);

  // Enable header-drag repositioning (position kept in memory only).
  bindFloatingPanelDrag(panel);

  const list = document.createElement('div');
  list.className = 'mockkit-floating-rules__list';
  panel.appendChild(list);

  // Mock grid widget — shown only in collapsed state. Clicking it expands
  // the panel back to the full list view.
  const mock = document.createElement('div');
  mock.className = 'mockkit-floating-rules__mock';
  mock.title = 'Expand rules panel';
  const mockGrid = document.createElement('div');
  mockGrid.className = 'mockkit-floating-rules__mock-grid';
  const mockCount = document.createElement('span');
  mockCount.className = 'mockkit-floating-rules__mock-count';
  mockCount.textContent = '0/0';
  mock.appendChild(mockGrid);
  mock.appendChild(mockCount);
  mock.addEventListener('click', toggleFloatingRulesCollapsed);
  panel.appendChild(mock);

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
    console.log('【content】【mockkit-tools-iframe-show】receive message', request);
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

  // Mount the floating rules panel independently of the main side panel —
  // its visibility is gated only by the master toggle (stored in
  // ajaxToolsFloatingRulesEnabled) and its own collapse state.
  const floatingPanel = createFloatingRulesPanel();
  if (!floatingPanel.isConnected) {
    mountTarget.appendChild(floatingPanel);
  }
  loadFloatingRulesState(() => renderFloatingRules());

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
      });
    }
    // Global interceptor switch: forward to the page script and mirror it
    // locally so the floating rules panel can hide when interception pauses.
    if (key === 'ajaxToolsSwitchOn') {
      ajaxToolsRuntimeState.ajaxToolsSwitchOn = newValue !== false;
      applyFloatingPanelState();
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
      });
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
    }
    // Collapse state can be driven from elsewhere; keep the DOM in sync.
    if (key === FLOATING_COLLAPSED_KEY) {
      ajaxToolsRuntimeState.floatingRulesCollapsed = newValue === true;
      applyFloatingPanelState();
    }
  }
});
