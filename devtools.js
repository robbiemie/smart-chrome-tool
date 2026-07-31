// DevTools bootstrap: register a MockKit panel that sits alongside
// Elements / Console / Network. Opening the panel triggers workbench mount
// on the inspected tab (see panel.js), which works even on pages where the
// toolbar action cannot inject (e.g. enterprise-managed browsers that gate
// content-script loading but still allow the DevTools page).
//
// Panel label is derived from the manifest name so beta builds
// ("MockKit Beta vX") are visually distinct from production in the tab strip
// without any hardcoded branching.
const panelLabel = chrome.runtime.getManifest().name || 'MockKit';
chrome.devtools.panels.create(
  panelLabel,
  'icons/tools16.png',
  'panel.html',
  (panel) => {
    // Fires every time the user switches into the MockKit panel. We re-mount
    // the workbench on the current inspected tab so the panel stays useful
    // across tab navigation without a manual toggle.
    panel.onShown.addListener(() => {
      // panel.js handles the actual mount on its own load; this listener is
      // reserved for future re-show refresh logic.
    });
  },
);
