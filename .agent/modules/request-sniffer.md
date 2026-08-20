# Request Sniffer (live capture) — smart-chrome-tool (MockKit)

> Live XHR/fetch capture with one-click mock promotion; a Toolkit sub-tool.
> Part of the feature catalog — see [`README.md`](./README.md) for the index
> and master-switch model.

## Request Sniffer (§9)

**Summary:** Capture live XHR/fetch traffic on the page and list method/URL/
status/response; each row can be promoted to a mock rule in the selected group
with one click. Static assets filtered out. Now lives as a Toolkit sub-tool:
a draggable floating panel on the host page (content.js DOM), toggled by the
"Request Sniffer" switch inside the Toolkit master panel. **Subordinate to the
Interceptor master switch** — XHR/fetch hooks are installed only while
`ajaxToolsSwitchOn` is on, so live capture requires the Interceptor to be
active. Turning the Interceptor off force-closes the sniffer panel (persists
`ajaxToolsSnifferPanelOpen = false`); it stays closed after the Interceptor is
re-enabled and must be toggled back on manually.

**Lives in:**
- Emission: `pageScripts/index.js` (`emitCapturedRequest`)
- Hook install gate: `pageScripts/index.js` —
  `if (ajaxToolsSwitchOn && currentHostWhitelisted())` (Interceptor is the
  sole master; Sniffer cannot keep hooks alive on its own)
- Capture + UI: `content.js` (`createSnifferPanel`, `pushSnifferCapture`,
  `scheduleSnifferRender` (rAF coalescing), `renderSnifferList` (scroll-preserving),
  `setSnifferPanelVisible`, `setToolkitSnifferOpen`,
  `repositionSnifferPanel`, `bindSnifferPanelDrag`)
- State: `snifferState` (`requests` ring buffer max 500, `keyword`, `visible`, `dirty`, `renderPending`)
- Persistence: `ajaxToolsSnifferPanelOpen` storage key (restored on reload when
  Toolkit is on); `ajaxToolsToolkitPanelVisible` gates the Toolkit master panel
- Mock promotion: sniffer "Mock" button → `postMessage MOCKKIT_MOCK_CAPTURE`
  to iframe → `App.tsx` listener → `onMockCapture(selectedGroupIndex, capture)`
- Messages: `AJAX_TOOLS_REQUEST_CAPTURED` (page → content, feeds sniffer),
  `MOCKKIT_MOCK_CAPTURE` (content → iframe, promote to rule),
  `ajaxTools snifferEnabled` (content → page, install hooks for capture-only)

**Removed from React workbench:** the old `useRequestSniffer` hook +
`components/RequestSniffer/` + OperationsRail ModuleSection are no longer used
for the sniffer UI (the hook is kept for the `CapturedRequest` type only).

**Interceptor is the sole master switch:** the sniffer panel no longer hosts
an in-panel intercept toggle. The Interceptor switch in the workbench's Global
Controls is the only way to turn the master switch on/off — turning it off
force-closes the sniffer panel (see the master-switch model in
[`./README.md`](./README.md)), so an in-panel toggle would be a self-destruct
button and was removed.

**Positioning (bottom-left default):** the sniffer panel defaults to the
bottom-left anchor (`left:24px; bottom:24px`) so it never overlaps Floating
Rules (top-right), DOM Inspector (top-left), or Toolkit (bottom-right). It
only moves when the user drags it (`snifferPanelDragged` flag);
`repositionSnifferPanel` clears inline overrides so the CSS default takes over.

---

**Related:** [`interception.md`](./interception.md) (mock promotion target) · [`toolkit-animation.md`](./toolkit-animation.md) (Toolkit host) · [message types](../reference/message-types.md)
