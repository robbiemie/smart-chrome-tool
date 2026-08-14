# Floating Rules Panel — smart-chrome-tool (MockKit)

> Lightweight on-page rule toggles rendered by the content script. Part of the
> feature catalog — see [`README.md`](./README.md) for the index and
> master-switch model.

## Floating rules panel (§7)

**Summary:** A lightweight DOM panel rendered by `content.js` directly on the
page (not React), showing current group's rules with on/off toggles, hit dots,
drag-to-move, collapse, CSR + inspect buttons. Lets users toggle rules without
opening the full workbench.

**Lives in:**
- `content.js` (`createFloatingRulesPanel`, `renderFloatingRules`,
  `refreshFloatingHitDots`, `bindFloatingPanelDrag`, `createFloatingCsrButton`,
  `createFloatingInspectButton`, `applyFloatingPanelState`,
  `repositionFloatingRulesPanel`, `closeFloatingRules`)
- Storage: `ajaxToolsFloatingRulesEnabled`
- Toggle: `html/iframePage/main/hooks/useFloatingRules.ts`

**Close button:** the panel header has a one-click **close** (×) icon that
fully hides the panel by flipping `ajaxToolsFloatingRulesEnabled` to false
(delegates to `setToolkitRulesOpen(false)` so the Toolkit panel's Floating
Rules switch and the workbench stay in sync). The panel can be re-opened from
the Toolkit panel or the workbench Floating Rules switch. There is no separate
minimize/collapse state — the minimize-to-mock-grid module has been removed.

**Drag:** `bindFloatingPanelDrag` binds drag to the header so the panel is
repositionable. Drag position is in-memory only (resets to the default
top-right anchor on refresh).

**Double-click to reset position:** double-clicking the header (away from
buttons) snaps the panel back to its default top-right anchor without a page
refresh — clears the `floatingPanelDragged` flag and delegates to
`repositionFloatingRulesPanel` so the `!important` CSS default takes over.
Useful because the drag position is in-memory only; without this the only
reset path was reloading the tab.

**Positioning (top-right default):** the rules panel defaults to the top-right
anchor (`right:24px; top:24px`), separate from the Toolkit master panel which
stays bottom-right — the two never overlap. It only moves when the user drags
it (`floatingPanelDragged` flag); `repositionFloatingRulesPanel` clears any
inline overrides so the CSS default takes over. The panel is appended LAST in
`mountPanelContainer` so at the shared `z-index: 2147483647` it stacks above
other top-right overlays (Animation).

**Subordinate to the Interceptor master switch:** turning the Interceptor off
force-hides the panel (persists `ajaxToolsFloatingRulesEnabled = false`). The
panel stays hidden after the Interceptor is re-enabled and must be toggled
back on manually.

---

## Auto-add host to whitelist on enable

Turning the Floating Rules switch ON is treated as explicit intent to use the
mock layer on the current page. If the current host is not yet in the domain
whitelist, it is auto-appended to `ajaxToolsDomainWhitelist` (persisted) so the
panel shows immediately instead of staying `display:none` with no feedback. A
short green success toast ("Added to whitelist — {host} is now allowed")
confirms the change so the persistent side effect is transparent. Wired in
`setToolkitRulesOpen(true)` (covers both the Toolkit switch click and the
Toolkit re-open restore path) via `maybeAutoAddHostToWhitelist` →
`addCurrentHostToWhitelist` + `showWhitelistAddedToast`. The auto-add is a
no-op if the host is already allowlisted, so toggling on an already-allowed
host shows no toast and performs no storage write.

---

**Related:** [`access-control.md`](./access-control.md) (whitelist) · [`toolkit-animation.md`](./toolkit-animation.md) (Toolkit host) · [`feedback.md`](./feedback.md) (success toast)
