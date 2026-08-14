# DevTools Panel Entry — smart-chrome-tool (MockKit)

> Dual-entry workbench: the React app is also available as a Chrome DevTools
> panel. Part of the feature catalog — see [`README.md`](./README.md) for the
> index and master-switch model.

## DevTools panel entry — dual-entry with iframe workbench (§18)

**Summary:** The React workbench is now available as a Chrome DevTools panel
("MockKit" tab), in addition to the existing iframe side panel. Both entries
share the same `chrome.storage.local` data and the same React bundle, so
changes made in one are instantly visible in the other via `storage.onChanged`.
The DevTools panel is immune to host-page CSP / z-index / style interference,
making it the preferred entry for Monaco-heavy editing (ModifyDataModal) and
bulk rule management.

**Lives in:**
- Panel registration: `html/iframePage/main/devtools.ts` →
  `chrome.devtools.panels.create('MockKit', icon, 'index.html')`
- Panel HTML: `html/iframePage/devtools.html` (loaded by Chrome when DevTools
  opens; runs the registration script)
- Panel page: `html/iframePage/dist/index.html` (the SAME React app as the
  iframe workbench — no separate bundle)
- `pageOrigin` DevTools fallback: `html/iframePage/main/hooks/usePageHeaders.ts`
  — when the URL param is missing (DevTools context), falls back to
  `chrome.devtools.inspectedWindow.eval('location.origin')` to get the
  inspected page's origin for Page Headers (DNR) features.

**Wiring:**
- `manifest.json` `devtools_page` → `devtools.html` → `devtools.ts` →
  `chrome.devtools.panels.create()` → loads `index.html` as the panel page →
  React app boots, reads/writes `chrome.storage.local` → `storage.onChanged`
  syncs to content script / iframe / SW.
- Vite builds `devtools.html` as a second rollup input (`vite.config.js`),
  producing `dist/devtools.html` + `dist/static/js/devtools-*.js`. The
  `html/iframePage/dist` directory is already a runtime entry in `build.js`,
  so no packaging change was needed.

**What works in the DevTools panel:** Rules management (GroupWorkbench),
ModifyDataModal (Monaco editor), Page Headers (with async `pageOrigin`
fallback), Import/Export, CSR toggle, self-update, OperationsRail (Interceptor
switch + Toolkit switch), Tools tab.

**What does NOT work from the DevTools panel (requires the floating panel on
the page):** DOM Inspect, Floating Rules visibility, Animation Control, Request
Sniffer (floating), page-interaction toasts. These are content-script / page
features. The Toolkit switch in the panel persists its state to storage, and
the content script's `storage.onChanged` listener shows/hides the floating
Toolkit panel accordingly — so toggling Toolkit from the panel still controls
the page-side overlays.

**Dual-entry coexistence:** Both entries can be open simultaneously. Session-
only UI state (active tab, modal open/close, selected group) is independent
per entry; persisted data (rules, switch state, whitelist) syncs via
`storage.onChanged`. Incoming `postMessage` events from content.js
(`AJAX_TOOLS_OPEN_EDIT`, `MOCKKIT_MOCK_CAPTURE`, `AJAX_TOOLS_APPLY_UPDATE`)
only reach the iframe workbench (the DevTools panel has no parent iframe
relationship) — these drive floating-panel-initiated actions and are not
needed in the panel context where the user is already in the workbench.

---

**Related:** [`architecture/context.md`](../architecture/context.md) (DEVTOOLS context) · [`page-headers.md`](./page-headers.md) (`pageOrigin` fallback) · [`panel-chrome.md`](./panel-chrome.md)
