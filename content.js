
const AJAX_TOOLS_RUNTIME_STATE_KEY = '__ajaxToolsRuntimeState__';
const AJAX_TOOLS_STYLE_ID = 'robbie-ajax-interceptor-runtime-style';

const ajaxToolsRuntimeState = window[AJAX_TOOLS_RUNTIME_STATE_KEY] || (window[AJAX_TOOLS_RUNTIME_STATE_KEY] = {
  panelContainer: null,
  panelMessageListenerBound: false,
  panelMountObserver: null,
  panelInitBound: false,
  floatingPanel: null,
  floatingPanelBound: false,
  floatingRulesEnabled: true,
  floatingRulesCollapsed: false,
});

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
  .robbie-ajax-interceptor-container {
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
    box-shadow: rgba(0, 0, 0, 0.12) 0px 0px 15px 2px !important;
    background: #fff;
    overflow: hidden;
  }
  .ajax-interceptor-action-bar {
    height: 40px;
    min-height: 40px;
    padding: 0 12px 0 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .robbie-ajax-interceptor-iframe {
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
  .robbie-ajax-floating-rules {
    position: fixed !important;
    right: 24px !important;
    bottom: 24px !important;
    width: 360px !important;
    max-height: 420px !important;
    display: none;
    flex-direction: column;
    z-index: 2147483646 !important;
    border-radius: 12px !important;
    box-shadow: rgba(0, 0, 0, 0.12) 0px 0px 15px 2px !important;
    background: #fff;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    color: #1b2822;
  }
  .robbie-ajax-floating-rules__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #f0f0f0;
    font-weight: 600;
    font-size: 13px;
    background: #fafafa;
    flex-shrink: 0;
    cursor: grab;
    user-select: none;
  }
  .robbie-ajax-floating-rules__header--dragging {
    cursor: grabbing;
  }
  .robbie-ajax-floating-rules__header-left {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .robbie-ajax-floating-rules__count {
    font-weight: 400;
    font-size: 11px;
    color: #999;
  }
  .robbie-ajax-floating-rules__header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .robbie-ajax-floating-rules__csr-btn {
    height: 22px;
    padding: 0 8px;
    border: 1px solid #d9d9d9;
    border-radius: 11px;
    background: #fff;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    color: #555;
    line-height: 20px;
  }
  .robbie-ajax-floating-rules__csr-btn--on {
    background: #1a9b7f;
    border-color: #1a9b7f;
    color: #fff;
  }
  .robbie-ajax-floating-rules__collapse-btn {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    color: #888;
    font-size: 14px;
    line-height: 1;
  }
  .robbie-ajax-floating-rules__collapse-btn:hover {
    background: #eaeaea;
    color: #333;
  }
  .robbie-ajax-floating-rules__list {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .robbie-ajax-floating-rules__item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid #f5f5f5;
  }
  .robbie-ajax-floating-rules__item:last-child {
    border-bottom: none;
  }
  .robbie-ajax-floating-rules__item-toggle {
    flex-shrink: 0;
    margin-top: 1px;
    cursor: pointer;
  }
  .robbie-ajax-floating-rules__item-edit {
    flex-shrink: 0;
    padding: 2px 6px;
    border: none;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    color: #1a9b7f;
    font-size: 11px;
    line-height: 1.4;
  }
  .robbie-ajax-floating-rules__item-edit:hover {
    background: rgb(26 155 127 / 10%);
  }
  .robbie-ajax-floating-rules__item-body {
    flex: 1;
    min-width: 0;
  }
  .robbie-ajax-floating-rules__item-url {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #1b2822;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .robbie-ajax-floating-rules__item-method {
    display: inline-block;
    margin-right: 4px;
    padding: 0 4px;
    border-radius: 3px;
    background: #e8e8e8;
    font-size: 10px;
    font-weight: 600;
    color: #555;
  }
  .robbie-ajax-floating-rules__item-note {
    color: #999;
    font-size: 11px;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .robbie-ajax-floating-rules__empty {
    padding: 24px 14px;
    text-align: center;
    color: #999;
    font-size: 12px;
  }
  /* Collapsed state: shrink to a compact mock grid widget. */
  .robbie-ajax-floating-rules--collapsed {
    width: auto !important;
    max-height: none !important;
    padding: 8px !important;
    border-radius: 14px !important;
  }
  .robbie-ajax-floating-rules--collapsed .robbie-ajax-floating-rules__header,
  .robbie-ajax-floating-rules--collapsed .robbie-ajax-floating-rules__list {
    display: none !important;
  }
  .robbie-ajax-floating-rules__mock {
    display: none;
    cursor: pointer;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 2px;
  }
  .robbie-ajax-floating-rules--collapsed .robbie-ajax-floating-rules__mock {
    display: flex;
  }
  .robbie-ajax-floating-rules__mock-grid {
    display: grid;
    grid-template-columns: repeat(3, 8px);
    grid-auto-rows: 8px;
    gap: 3px;
  }
  .robbie-ajax-floating-rules__mock-cell {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: #f0f0f0;
  }
  .robbie-ajax-floating-rules__mock-cell--on {
    background: #1a9b7f;
  }
  .robbie-ajax-floating-rules__mock-cell--off {
    background: #d9d9d9;
  }
  .robbie-ajax-floating-rules__mock-count {
    font-size: 10px;
    font-weight: 600;
    color: #1b2822;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
`);
injectedCss('icons/iconfont/iconfont.css');
injectedScript('html/iframePage/mock.js');
const pageScripts = injectedScript('pageScripts/index.js');
if (pageScripts) {
  pageScripts.addEventListener('load', () => {
    chrome.storage.local.get(['iframeVisible', 'ajaxToolsSwitchOn', 'ajaxToolsSwitchOnNot200', 'ajaxDataList', 'ajaxToolsSkin'], (result) => {
      // console.log('【ajaxTools content.js】【storage】', result);
      const {ajaxToolsSwitchOn = true, ajaxToolsSwitchOnNot200 = true, ajaxDataList = []} = result;
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxDataList', value: ajaxDataList});
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxToolsSwitchOn', value: ajaxToolsSwitchOn});
      postMessage({type: 'ajaxTools', to: 'pageScript', key: 'ajaxToolsSwitchOnNot200', value: ajaxToolsSwitchOnNot200});
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
    const iframe = document.querySelector('.robbie-ajax-interceptor-iframe');
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

// Apply the current enabled/collapsed state to the floating panel DOM.
// The panel is hidden entirely when the master toggle is off; otherwise it
// toggles between the expanded list view and the collapsed mock grid.
function applyFloatingPanelState() {
  const panel = ajaxToolsRuntimeState.floatingPanel;
  if (!panel) return;

  if (!ajaxToolsRuntimeState.floatingRulesEnabled) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  panel.classList.toggle(
    'robbie-ajax-floating-rules--collapsed',
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
  const header = panel.querySelector('.robbie-ajax-floating-rules__header');
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
    panel.style.left = `${Math.max(0, Math.min(nextLeft, maxLeft))}px`;
    panel.style.top = `${Math.max(0, Math.min(nextTop, maxTop))}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    header.classList.remove('robbie-ajax-floating-rules__header--dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  header.addEventListener('mousedown', (event) => {
    // Ignore drag when clicking on buttons (collapse / csr) inside the header.
    if (event.target.closest('button')) return;
    dragging = true;
    header.classList.add('robbie-ajax-floating-rules__header--dragging');
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
    btn.classList.toggle('robbie-ajax-floating-rules__csr-btn--on', on);
  });
}

function createFloatingCsrButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'robbie-ajax-floating-rules__csr-btn';
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
        btn.classList.toggle('robbie-ajax-floating-rules__csr-btn--on', nextCsr);
      });
    });
  });
  syncFloatingCsrBtnState(btn);
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
    const listEl = panel.querySelector('.robbie-ajax-floating-rules__list');
    const headerEl = panel.querySelector('.robbie-ajax-floating-rules__title');
    const countEl = panel.querySelector('.robbie-ajax-floating-rules__count');

    const groupTitle = group?.summaryText || `Group ${groupIndex + 1}`;
    if (headerEl) headerEl.textContent = groupTitle;

    const interfaceList = group?.interfaceList || [];
    if (countEl) countEl.textContent = `${interfaceList.length} rules`;

    // Render the collapsed mock grid: a 3x3 cell matrix visualizing rule
    // states (green = enabled, gray = disabled, faint = empty slot) plus an
    // enabled/total counter. Shown only when the panel is collapsed.
    const mockGridEl = panel.querySelector('.robbie-ajax-floating-rules__mock-grid');
    const mockCountEl = panel.querySelector('.robbie-ajax-floating-rules__mock-count');
    if (mockGridEl) {
      mockGridEl.innerHTML = '';
      const enabledCount = interfaceList.filter((r) => r.open !== false).length;
      for (let i = 0; i < 9; i += 1) {
        const cell = document.createElement('span');
        cell.className = 'robbie-ajax-floating-rules__mock-cell';
        const rule = interfaceList[i];
        if (rule) {
          cell.classList.add(
            rule.open !== false
              ? 'robbie-ajax-floating-rules__mock-cell--on'
              : 'robbie-ajax-floating-rules__mock-cell--off'
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
      listEl.innerHTML = '<div class="robbie-ajax-floating-rules__empty">No rules in this group</div>';
      return;
    }

    listEl.innerHTML = '';
    interfaceList.forEach((ruleItem, ruleIndex) => {
      const row = document.createElement('div');
      row.className = 'robbie-ajax-floating-rules__item';

      // Toggle switch — writes back to storage so the React workbench syncs.
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = ruleItem.open !== false;
      toggle.className = 'robbie-ajax-floating-rules__item-toggle';
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
      body.className = 'robbie-ajax-floating-rules__item-body';

      const urlLine = document.createElement('div');
      urlLine.className = 'robbie-ajax-floating-rules__item-url';
      urlLine.textContent = ruleItem.request || '(empty)';
      body.appendChild(urlLine);

      if (ruleItem.requestDes) {
        const note = document.createElement('div');
        note.className = 'robbie-ajax-floating-rules__item-note';
        note.textContent = ruleItem.requestDes;
        body.appendChild(note);
      }

      // Edit entry: reveal the main side panel (so the modal is visible)
      // and ask the iframe to open the edit modal for this rule.
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'robbie-ajax-floating-rules__item-edit';
      editBtn.textContent = 'Edit';
      editBtn.title = 'Edit this rule in the workbench';
      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const mainPanel = ajaxToolsRuntimeState.panelContainer;
        if (mainPanel) {
          mainPanel.style.setProperty('transform', 'translateX(0)', 'important');
          chrome.storage.local.set({ iframeVisible: true });
        }
        const iframe = document.querySelector('.robbie-ajax-interceptor-iframe');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            { type: 'AJAX_TOOLS_OPEN_EDIT', groupIndex, ruleIndex },
            '*'
          );
        }
      });

      row.appendChild(toggle);
      row.appendChild(body);
      row.appendChild(editBtn);
      listEl.appendChild(row);
    });
  });
}

function createFloatingRulesPanel() {
  if (ajaxToolsRuntimeState.floatingPanel?.isConnected) {
    return ajaxToolsRuntimeState.floatingPanel;
  }

  const existing = document.getElementById('robbie-ajax-floating-rules');
  if (existing) {
    ajaxToolsRuntimeState.floatingPanel = existing;
    return existing;
  }

  const panel = document.createElement('div');
  panel.className = 'robbie-ajax-floating-rules';
  panel.id = 'robbie-ajax-floating-rules';

  const header = document.createElement('div');
  header.className = 'robbie-ajax-floating-rules__header';
  const headerLeft = document.createElement('div');
  headerLeft.className = 'robbie-ajax-floating-rules__header-left';
  const title = document.createElement('span');
  title.className = 'robbie-ajax-floating-rules__title';
  title.textContent = 'Rules';
  const count = document.createElement('span');
  count.className = 'robbie-ajax-floating-rules__count';
  count.textContent = '0 rules';
  headerLeft.appendChild(title);
  headerLeft.appendChild(count);
  header.appendChild(headerLeft);

  const headerActions = document.createElement('div');
  headerActions.className = 'robbie-ajax-floating-rules__header-actions';
  const csrBtn = createFloatingCsrButton();
  headerActions.appendChild(csrBtn);
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'robbie-ajax-floating-rules__collapse-btn';
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
  list.className = 'robbie-ajax-floating-rules__list';
  panel.appendChild(list);

  // Mock grid widget — shown only in collapsed state. Clicking it expands
  // the panel back to the full list view.
  const mock = document.createElement('div');
  mock.className = 'robbie-ajax-floating-rules__mock';
  mock.title = 'Expand rules panel';
  const mockGrid = document.createElement('div');
  mockGrid.className = 'robbie-ajax-floating-rules__mock-grid';
  const mockCount = document.createElement('span');
  mockCount.className = 'robbie-ajax-floating-rules__mock-count';
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

  const existingContainer = document.getElementById('robbie-ajax-interceptor-container');
  if (existingContainer) {
    ajaxToolsRuntimeState.panelContainer = existingContainer;
    return ajaxToolsRuntimeState.panelContainer;
  }

  const container = document.createElement('div');
  container.className = 'robbie-ajax-interceptor-container';
  container.id = 'robbie-ajax-interceptor-container';
  container.style.setProperty('transform', 'translateX(calc(100% + 20px))', 'important');

  const header = actionBar(container);
  container.appendChild(header);

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL(`html/iframePage/dist/index.html?pageOrigin=${encodeURIComponent(window.location.origin)}`);
  iframe.className = 'robbie-ajax-interceptor-iframe';
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
    console.log('【content】【robbie-ajax-tools-iframe-show】receive message', request);
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
