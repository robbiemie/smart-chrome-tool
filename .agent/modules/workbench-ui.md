# Workbench Tools Tab — smart-chrome-tool (MockKit)

> Top-level tab bar + Tools tab consolidating config utilities. Part of the
> feature catalog — see [`README.md`](./README.md) for the index and
> master-switch model.

## Workbench Tools tab & tab registry (§16)

**Summary:** A top-level tab bar inside the React workbench (`workbench-main`)
switches the main content area between the **Rules** workbench (the default
`GroupWorkbench`) and a **Tools** tab. The Tools tab consolidates the
configuration utilities — CSR Mode, Page Headers, Import / Export — as
first-class React cards. These previously lived as config rows inside the
content.js Toolkit floating panel, where three of them opened React modals
via a `postMessageToIframe` hop into an often-hidden (off-screen) iframe, so
clicks appeared to do nothing. Moving them into the workbench makes them
visible React components and removes the cross-context indirection.

**Tab registry (extensibility):** The tab bar is rendered from a `WORKBENCH_TABS`
array in `App.tsx` (`{ key, label }` entries). Adding a future tab (e.g.
Settings, Sniffer, Performance) is one entry in that array plus a branch in the
content switch — no layout edits. The `OperationsRail` (master Interceptor +
Toolkit switches) stays always-visible to the left regardless of the active
tab, so master controls remain reachable from every tab.

**Lives in:**
- Tab bar + registry: `html/iframePage/main/App.tsx` (`WORKBENCH_TABS`,
  `activeTab` state, `<nav className="workbench-tabs">` render)
- Tools tab UI: `html/iframePage/main/components/ToolsTab/index.tsx` — renders
  its cards from a local `tools` registry array (one object per tool: icon /
  title / hint / status / action). Adding a tool is one entry in that array.
- CSR Mode card: backed by `html/iframePage/main/hooks/usePageRenderMode.ts`
  (talks to the SW via `GET_PAGE_RENDER_MODE` / `SET_PAGE_RENDER_MODE`).
- Page Headers card: opens the existing `PageHeadersModal` via
  `usePageHeaders.openModal`; quick-enable switch uses `toggleQuickEnabled`.
- Import / Export card: opens the existing `BatchImportExport` modal via
  `setImportExportVisible(true)`.
- Styles: `html/iframePage/main/App.css` (`.workbench-tabs*`),
  `ToolsTab/index.css`.
- Removed: content.js `postMessageToIframe` function and the four Toolkit
  config rows (CSR / Headers / Import-Export / Collapse-All). The floating
  rules panel's CSR button (`createFloatingCsrButton` → `toggleCsrMode`)
  remains as a runtime quick-toggle on the host page. Collapse All was retired
  from the Tools tab (rule-card detail expansion is driven directly by each
  group's collapse affordance in `GroupWorkbench`).

**Wiring:**
- Tab switch → `setActiveTab(key)` → conditional render of `GroupWorkbench`
  (rules) or `ToolsTab` (tools).
- CSR card switch → `usePageRenderMode.toggle()` → SW `SET_PAGE_RENDER_MODE`
  → `chrome.tabs.update` reloads the tab with/without `?__csr=1`.
- Page Headers card → `openPageHeadersModal()` / `toggleQuickEnabled(v)` →
  `usePageHeaders` → `ajaxToolsHeaderProfiles` storage → SW
  `SYNC_PAGE_HEADERS_RULES` → DNR dynamic rules.
- Import/Export card → `setImportExportVisible(true)` → `BatchImportExport`
  modal → `onBatchImport` → `useRegistry` → `ajaxDataList` storage.

**Constraint:** CSR toggle reloads the active tab, which destroys the
workbench iframe — the card's optimistic switch flip is only visible until the
reload tears the iframe down. This is by design (CSR is a page-level mode
change).

---

**Related:** [`render-mode.md`](./render-mode.md) · [`page-headers.md`](./page-headers.md) · [`data-management.md`](./data-management.md) (Tools tab cards)
