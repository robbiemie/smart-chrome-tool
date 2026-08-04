# Core Feature Catalog — smart-chrome-tool (MockKit)

> **This is a living document.** Every agent that adds or changes a core
> feature MUST update this file in the same change — see
> [`../standards/governance.md`](../standards/governance.md).
>
> Format per entry: name, one-line summary, where it lives, how it's wired.
> Keep entries concise; link to source files with `path:line`.

---

## 1. Response interception & rewriting

**Summary:** Override XHR/fetch response bodies for matched requests, by URL +
method, using literal substring or regex matching. Override text can be raw
JSON or a function string executed against request args.

**Lives in:**
- Matching & override: `pageScripts/index.js` (`getMatchedInterface`,
  `getOverrideText`, `executeStringFunction`)
- Rule storage & UI: `html/iframePage/main/hooks/useRegistry.ts`,
  `components/ModifyDataModal/`
- Config push: `content.js` (relays `ajaxDataList` to page script)

**Wiring:** Workbench → `chrome.storage.local.ajaxDataList` →
`storage.onChanged` → content `postMessage` → page script → patched XHR/fetch.

---

## 2. Request rewriting (URL / method / headers)

**Summary:** For a matched rule, rewrite the outgoing request URL, HTTP
method, and/or headers before the request leaves the page.

**Lives in:**
- Patched XHR/fetch open/send: `pageScripts/index.js`
- Editor: `html/iframePage/main/components/ModifyDataModal/` (Request tab)
- Type: `ModifyDataModalOpenProps` (`replacementMethod`, `replacementUrl`,
  `headersText`) in `main/types/registry.ts`

---

## 3. Request payload script injection

**Summary:** Run a user-supplied JS function string against the parsed request
params before sending, to dynamically transform the payload.

**Lives in:**
- `pageScripts/index.js` → `executeStringFunction`, `getRequestParams`
- Editor: `ModifyDataModal` (Request tab, `requestPayloadText`)

---

## 4. Per-page request header rules (declarativeNetRequest)

**Summary:** Set/remove request headers per origin using MV3
`declarativeNetRequest` dynamic rules. Compiled from header profiles in the SW;
applies even when the page script can't (e.g. cross-origin). One-click enable
per profile.

**Lives in:**
- Rule compilation: `service_worker.js` (`compileDynamicRules`,
  `syncHeaderRules`, `buildRuleId`, `normalizeHeaderOperations`)
- Storage: `ajaxToolsHeaderProfiles`, `ajaxToolsManagedHeaderRuleIds`
- UI: `html/iframePage/main/components/PageHeadersModal/`,
  `hooks/usePageHeaders.ts`
- Sync trigger: `SYNC_PAGE_HEADERS_RULES` message + `storage.onChanged`

**Rule-ID model:** `930000 + hash(profileId:ruleId) % 70000`; forbidden headers
filtered (`FORBIDDEN_REQUEST_HEADERS`).

---

## 5. CSR mode toggle

**Summary:** Toggle client-side rendering for the active tab by adding/removing
`__csr=1` URL param via `chrome.tabs.update`.

**Lives in:**
- `service_worker.js` (`getPageRenderMode`, `setPageRenderMode`,
  `buildRenderModeUrl`)
- `html/iframePage/main/hooks/usePageRenderMode.ts`
- Floating panel button: `content.js` (`createFloatingCsrButton`,
  `syncFloatingCsrBtnState`)
- Messages: `GET_PAGE_RENDER_MODE`, `SET_PAGE_RENDER_MODE`

---

## 6. Domain whitelist

**Summary:** Gate the mock layer and floating panel to specific host patterns
(`*`, `*.foo.com`, `api.foo.com`). Default `['*']` = all hosts.

**Lives in:**
- Matching: `content.js` (`patternToRegExp`, `isHostnameWhitelisted`,
  `currentHostWhitelisted`, `applyFloatingPanelState`)
- Storage: `ajaxToolsDomainWhitelist`
- UI: `html/iframePage/main/hooks/useDomainWhitelist.ts`,
  `components/OperationsRail/` (Domain Whitelist section)

---

## 7. Floating rules panel

**Summary:** A lightweight DOM panel rendered by `content.js` directly on the
page (not React), showing current group's rules with on/off toggles, hit dots,
drag-to-move, collapse, CSR + inspect buttons. Lets users toggle rules without
opening the full workbench.

**Lives in:**
- `content.js` (`createFloatingRulesPanel`, `renderFloatingRules`,
  `refreshFloatingHitDots`, `bindFloatingPanelDrag`, `createFloatingCsrButton`,
  `createFloatingInspectButton`, `applyFloatingPanelState`,
  `repositionFloatingRulesPanel`)
- Storage: `ajaxToolsFloatingRulesEnabled`, `ajaxToolsFloatingRulesCollapsed`
- Toggle: `html/iframePage/main/hooks/useFloatingRules.ts`

**Drag (expanded + collapsed):** `bindFloatingPanelDrag` binds drag to BOTH
the header (expanded state) and the `__mock` widget (collapsed state), so the
panel is draggable in either form. Drag position is in-memory only (resets to
the default top-right anchor on refresh).

**Positioning (top-right default):** the rules panel defaults to the top-right
anchor (`right:24px; top:24px`), separate from the Toolkit master panel which
stays bottom-right — the two never overlap. It only moves when the user drags
it (`floatingPanelDragged` flag); `repositionFloatingRulesPanel` clears any
inline overrides so the CSS default takes over. The panel is appended LAST in
`mountPanelContainer` so at the shared `z-index: 2147483647` it stacks above
other top-right overlays (Sniffer/Animation).

**Independence from interceptor switch:** the panel stays visible even when
the global `ajaxToolsSwitchOn` interceptor switch is off — users can toggle
rules while interception is paused (rules apply once interception resumes).
`applyFloatingPanelState` no longer hides the panel based on
`ajaxToolsSwitchOn`.

---

## 8. DOM Inspector (审查元素)

**Summary:** A self-contained DevTools-style element inspector (no DevTools
API) with two modes, each entered from its own entry on the DOM Inspector
panel header (the top-left draggable panel created by `showDomInspectorPanel`
— NOT the mock floating rules panel at top-right):

- **Inspect mode** (green aim icon, or the workbench DOM Inspect button): pick
  a node → show a draggable panel with selector, Core Styles table (editable
  colors via native picker, live inline-style writes), editable size box,
  Chrome-style box model diagram, and a collapsible full computed-styles list.
  One-shot: click picks, then exits.
- **Measure mode** (red ruler icon — visually distinct from the green aim
  icon): anchor+hover distance measurement. First click anchors baseline A
  (persistent blue box); hovering draws a red guide from A to the hovered
  element; second click locks B; subsequent clicks replace A. Esc exits.
  Distance rendering adapts to the two rects' relative position: vertical line
  + single value when horizontally overlapping, horizontal line + single value
  when vertically overlapping, semi-transparent red gap rect with centered
  "h × v" label when offset on both axes.

  ![测距示例](../../assets/example5.png)

**Active-state indicators (both modes):** every inspector entry button shows a
solid active state while its mode is on, synced across ALL entry points by
`syncInspectorEntryButtons()` (queries by class, so it survives the DOM
Inspector panel being destroyed/rebuilt — the old single-ref `measureBtn`
approach lost sync on rebuild). It is called from `startDomInspector`,
`stopDomInspector`, AND at the end of `showDomInspectorPanel` — the last call
is essential because the reinspect/measure buttons are created inside
`showDomInspectorPanel`, so syncing only in `startDomInspector` (which runs
before the panel exists) left them without their `--on` state, and measure
mode's per-click panel rebuild kept wiping it:
- **Inspect** (green aim icon, 3 entry points: floating-rules panel aim, DOM
  Inspector panel reinspect, iframe OperationsRail): solid green background +
  tooltip switches to "Inspecting — click a node, Esc to cancel". One-shot —
  the indicator clears the moment a node is picked (inspect exits) or Esc is
  pressed.
- **Measure** (red ruler icon): solid red background + pulsing box-shadow
  animation + tooltip switches to "测距已开启". Stays on until toggled off or
  Esc. The two modes are mutually exclusive; starting one stops the other, and
  every entry button stops a conflicting active mode first (cross-mode
  stop-then-start) so switching is always possible from any entry.

**Hover-overlay color is mode-aware** so the user can tell inspect vs measure
apart from the selection border alone, not just the buttons:
- Inspect mode → green border (`#1a9b7f`) + green label.
- Measure mode → orange border (`#fa8c16`) + orange label for the hovered
  element B, kept distinct from the blue anchor A and the red measurement
  guides.

**Margin highlight on inspect:** while inspecting (hovering), a dashed blue
box (`#3b82f6`) encloses the element's margin box on the page so margins are
visible at a glance — not just in the Box Model diagram. Hidden when all four
margins are zero and in measure mode. Created/destroyed with the inspect
overlay in `createDomInspectorOverlay`/`destroyDomInspectorOverlay`, updated
per-frame in `renderFrame`; CSS class `mockkit-dom-inspector-margin-overlay`.

After a node is picked (click), a PERSISTENT margin overlay
(`mockkit-dom-inspector-margin-overlay--picked`) stays on the page until the
DOM Inspector panel closes — created in `showDomInspectorPanel` via
`showPickedMarginOverlay(node)`, cleared on panel close or re-pick. It tracks
the node on scroll/resize via `repositionPickedMarginOverlay` (rAF-throttled).

**Panel distinction (do not confuse):**
- **DOM Inspector panel** (`mockkit-dom-inspector*`, top-left, created by
  `showDomInspectorPanel`): shows node details / hints; hosts BOTH the inspect
  (aim) and measure (ruler) entry buttons on its header.
- **Mock floating rules panel** (`mockkit-floating-rules*`, top-right,
  created by `createFloatingRulesPanel`): shows rule list; has its own inspect
  button but NO measure button.

**Lives in:** `content.js` (`startDomInspector`/`stopDomInspector` with `mode`
param, `syncInspectorEntryButtons`, `createDomInspectorMeasureButton`,
`computeAnchorMeasurement`, `drawMeasurements`, `updateAnchorOverlay`,
`renderFrame`, `pickDomNode`, `showDomInspectorPanel`); state in
`domInspectorState` (`mode`, `anchor`, `lockedTarget`, `anchorOverlay`,
`overlay`, `overlayLabel`, `measurements`).

**Trigger:** DOM Inspector panel header buttons (aim icon → inspect, ruler
icon → measure), or `MOCKKIT_INSPECT_DOM` message from iframe
(`components/OperationsRail/index.tsx` DOM Inspect button → inspect mode).

**Interaction model:** Inspect = click-to-pick-then-exit. Measure =
click=anchor/lock/replace-baseline (never exits), Esc=exit, hover=live
measurement. The two modes are mutually exclusive; starting one stops the
other.

**Mark by Class (sub-module):** An independent module at the bottom of the
DOM Inspector panel (below Element Box / Computed Styles). The user types a
CSS class name (without the dot) and presses Enter or clicks "Mark" — every
matching element on the page gets a purple outline (`#7c3aed`) with a
numbered badge in the top-left corner. A status line shows the match count
(e.g. "3 elements marked .foo — press Esc to clear"). Autocomplete
suggestions are built on first input focus from the page's unique class
names (capped at 200 entries). Marks are cleared via Esc or a "Clear"
button. Overlays persist on `document.body` across panel rebuilds and are
repositioned on scroll/resize via a rAF-throttled handler. State lives in
`domInspectorState` (`markOverlays`, `markBadges`, `markInputValue`,
`markClassName`, `markKeyListener`).

**Lives in:** `content.js` (`buildMarkByClassModule`, `applyClassMarks`,
`clearClassMarks`, `repositionClassMarks`, `scheduleMarkReposition`); CSS
classes `mockkit-dom-inspector__mark-*`.

---

## 9. Request Sniffer (live capture) — Toolkit sub-tool

**Summary:** Capture live XHR/fetch traffic on the page and list method/URL/
status/response; each row can be promoted to a mock rule in the selected group
with one click. Static assets filtered out. Now lives as a Toolkit sub-tool:
a draggable floating panel on the host page (content.js DOM), toggled by the
"Request Sniffer" switch inside the Toolkit master panel. **Decoupled from the
Interceptor master switch** — the sniffer installs XHR/fetch hooks via a
separate `snifferEnabled` flag so live capture works even when no mocking is
active; `modifyResponse` honors `ajaxToolsSwitchOn` so mock is skipped when
only the sniffer is on.

**Lives in:**
- Emission: `pageScripts/index.js` (`emitCapturedRequest`)
- Hook install gate: `pageScripts/index.js` —
  `if ((ajaxToolsSwitchOn || snifferEnabled) && currentHostWhitelisted())`
- Capture + UI: `content.js` (`createSnifferPanel`, `pushSnifferCapture`,
  `renderSnifferList`, `setSnifferPanelVisible`, `setToolkitSnifferOpen`,
  `repositionSnifferPanel`, `bindSnifferPanelDrag`)
- State: `snifferState` (`requests` ring buffer max 100, `keyword`, `visible`)
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

**Intercept toggle in panel:** the sniffer panel hosts an "拦截请求" switch
that toggles the global `ajaxToolsSwitchOn` interceptor master switch in-place
(writes `chrome.storage.local.ajaxToolsSwitchOn` AND postMessages directly to
the page script for immediate effect — does not rely solely on
`storage.onChanged`, which may not fire when the value is unchanged). The
`storage.onChanged` listener relays to the page script + floating panel, and
`syncSnifferInterceptSwitch` keeps the switch UI in sync (called on panel
build, on storage changes, and on init from `storage.local.get`). CSS class
`mockkit-sniffer-panel__intercept*`.

---

## 10. Import / Export

**Summary:** Back up and restore rule groups as JSON. Replace or append mode.

**Lives in:**
- `html/iframePage/main/utils/importJson.tsx`, `utils/exportJson.tsx`
- `components/BatchImportExport/`
- `useRegistry.onBatchImport` / `onImportClick`

---

## 11. Self-update from GitHub Releases

**Summary:** Periodically (6h alarm) and on-demand check GitHub Releases for a
newer version. API-first with HTML-scrape fallback (rate-limit resilient).
Download/unzip/write runs in a top-level extension page (`#update=1…`) because
the File System Access API is blocked in third-party iframes. Apply triggers
`chrome.runtime.reload()` + target-tab refresh.

**Lives in:**
- Check + fetch: `service_worker.js` (`checkForUpdate`,
  `fetchLatestRelease`, `fetchLatestReleaseViaHtml`, `compareVersions`)
- Download/unzip/write: `html/iframePage/main/utils/selfUpdate.ts`,
  `components/UpdateModal/`
- Storage: `ajaxToolsUpdateAvailable`, `ajaxToolsUpdateLastCheckAt`,
  `ajaxToolsGithubToken`
- Messages: `CHECK_UPDATE`, `RELOAD_EXTENSION`, `SET_GITHUB_TOKEN`

---

## 12. Workbench panel chrome (zoom / fullscreen / PiP / theme)

**Summary:** Toolbar buttons on the mounted iframe panel: zoom, fullscreen,
picture-in-picture, dark-theme (invert), open-in-new-tab, discussions, code-net.

**Lives in:** `content.js` (`actionBar`, `zoomButton`, `fullscreenButton`,
`pipButton`, `themeModeButton`, `newTabButton`, `discussionsButton`,
`codeNetButton`); PiP util `html/iframePage/main/utils/pictureInPicture.ts`.

---

## 13. DevTools panel entry

**Summary:** A Chrome DevTools panel (sibling of Elements / Console / Network)
that mounts the same React workbench on the inspected page. Serves as an
alternative entry point to the toolbar action, useful where the toolbar
action's content-script auto-injection is gated (e.g. enterprise-managed
browsers) — the DevTools page is permitted in many such environments and
`chrome.scripting.executeScript` re-injection still works through the
extension's existing `host_permissions`.

**Lives in:**
- Panel registration: `devtools.html` → `devtools.js`
  (`chrome.devtools.panels.create`)
- Panel UI + mount trigger: `panel.html` → `panel.js`
  (reads `chrome.devtools.inspectedWindow.tabId`, sends
  `DEVTOOLS_SHOW_WORKBENCH` to the service worker)
- Mount handler: `service_worker.js` (`DEVTOOLS_SHOW_WORKBENCH` branch — sets
  the workbench target tab, calls `ensurePanelMessageReceiver`, force-reveals
  the iframe via `iframeToggle`)
- Manifest: `devtools_page: "devtools.html"`

**Wiring:** DevTools panel open → `panel.js` →
`chrome.runtime.sendMessage({ type: 'DEVTOOLS_SHOW_WORKBENCH', tabId })` →
SW reuses `ensurePanelMessageReceiver` + `iframeToggle` (force-show) →
existing content.js iframe workbench on the inspected page. No new UI is
rendered inside the panel itself; the panel only shows mount status and a
retry button.

**Constraint:** Cannot mount on `chrome://`, `chrome-extension://`, `edge://`,
`about:`, or `view-source:` pages — Chrome blocks content-script injection on
those schemes regardless of entry point. The panel detects this and shows a
"blocked" status.

---

## 14. Toolkit Panel & Animation Control

**Summary:** A single draggable bottom-right **Toolkit** master panel
consolidates the auxiliary debug tools — Floating Rules, DOM Inspect, Animation
Control, and Request Sniffer — under one floating entry, keeping the mock layer
as the workbench's primary focus. The Toolkit panel is the primary floating
overlay; each sub-tool is toggled from a row inside it:
- **Floating Rules** (switch): shows/hides the rules list sub-panel (reuses the
  existing `mockkit-floating-rules` panel + `renderFloatingRules` logic; the
  switch writes the same `ajaxToolsFloatingRulesEnabled` storage key so the
  workbench stays in sync).
- **DOM Inspect** (button): one-shot — triggers pick mode (`startDomInspector`).
- **Animation Control** (switch): shows/hides the top-right animation popup.
- **Request Sniffer** (switch): shows/hides the live-capture panel (see §9).

Animation Control itself takes over every page animation — pause/resume and
scrub playback rate (0.5× / 1× / 2× / 4×) — so keyframes can be inspected at a
controlled pace. Pause uses TWO mechanisms so it truly freezes the whole page:
the Web Animations API (`document.getAnimations()` + `Animation.pause()`) for
CSS animations/transitions/`element.animate()`, PLUS a page-context override
of `requestAnimationFrame` (drop-only stub) for JS-driven animation loops
(canvas / WebGL / GSAP / React rAF loops) that WAAPI cannot reach. Session-only
state (never persisted) so a forgotten toggle cannot freeze animations on the
next visit.

**Lives in:**
- Toolkit master panel: `content.js` (`createToolkitPanel`,
  `setToolkitPanelVisible`, `setToolkitRulesOpen`, `setToolkitAnimationOpen`,
  `syncToolkitPanelUi`, `repositionToolkitPanel`, `bindToolkitPanelDrag`)
- State: `toolkitPanelState` (`visible`, `rulesOpen`, `animationOpen`)
- Animation popup UI + WAAPI control: `content.js`
  (`createAnimationControlPanel`, `applyAnimationControl`, `restoreAnimations`,
  `setAnimationEnabled`/`setAnimationPaused`/`cycleAnimationSpeed`,
  `syncAnimationPanelUi`, `onAnimationControlKeydown`)
- Animation state: `animationControlState` (`enabled`, `paused`, `speedIndex`,
  `originalStates` WeakMap, `pollTimer`, `styleObserver`)
- rAF neutralization (page context): `pageScripts/index.js`
  (`applyRafPatch`, `patchedRequestAnimationFrame`, `patchedCancelAnimationFrame`)
- Relay: `content.js` `setAnimationPaused`/`setAnimationEnabled` →
  `postMessage({type:'ajaxTools', to:'pageScript', key:'animationPaused', value})`
  → `pageScripts/index.js` message listener → `applyRafPatch`
- Styles: dedicated `<style>` blocks injected by `injectToolkitStyle` +
  `injectAnimationStyle` (NOT the shared `injectedStyle` helper, which dedupes)
- Rail entry: `html/iframePage/main/components/OperationsRail/index.tsx`
  ("Toolkit" ModuleSection → "Open Toolkit" button)
- Collapse state: `domDebug` key in `useModuleCollapseState.ts`
- Messages: `MOCKKIT_TOGGLE_TOOLKIT_PANEL` (iframe → content) shows/hides the
  Toolkit master panel

**Wiring:** OperationsRail "Open Toolkit" button → `window.parent.postMessage`
`MOCKKIT_TOGGLE_TOOLKIT_PANEL` → content.js `setToolkitPanelVisible` → Toolkit
panel mounted in top frame by `mountPanelContainer`. Inside the Toolkit panel:
- Floating Rules switch → `setToolkitRulesOpen` → writes
  `ajaxToolsFloatingRulesEnabled` → storage listener → `applyFloatingPanelState`
  shows/hides the rules list sub-panel.
- DOM Inspect button → `startDomInspector()` (one-shot pick mode).
- Animation Control switch → `setToolkitAnimationOpen` → `setAnimationPanelVisible`
  → animation popup shows. Enable switch on the popup drives
  `setAnimationEnabled` → `applyAnimationControl` iterates
  `document.getAnimations()`, caches each animation's original `{rate, playState}`
  in a WeakMap, then sets `playbackRate = original * speed` and `pause()`/`play()`.
  An 800ms `setInterval` re-applies to catch animations created after enable.
  Pause also relays `animationPaused` to the page script, which swaps
  `window.requestAnimationFrame` for a drop-only stub so JS animation loops
  freeze too; disabling control restores the original rAF. Keyboard shortcuts
  (registered once, top frame, capture phase) self-gate on the master toggle:
  `⌘⇧S` toggles pause, `⌘⇧X` cycles speed through `[1, 2, 4, 0.5]`. Shortcuts
  are ignored while focus is in an input/textarea/contenteditable.

**Anti-occlusion:** Floating overlays anchor to two zones — Toolkit
(bottom-right) and Rules/Sniffer/Animation (top-right) — so sub-panels never
overlap the Toolkit master panel. When the workbench opens, each overlay
floats **above** it via z-index (`2147483647`, same as the workbench, and
appended after it in the DOM so it stacks on top) rather than dodging left.
A single `MutationObserver` on the workbench container's `style`/`class`
(plus a `resize` listener) drives `repositionFloatingOverlays`, which resets
each non-dragged panel to its CSS default anchor. Each overlay's
auto-repositioning is skipped once the user drags it (`*PanelDragged` flags)
so auto-reposition never fights an explicit placement.

**Lifecycle:** The Toolkit master panel has no close (×) button — its
visibility is controlled solely by the workbench Toolkit switch
(`MOCKKIT_TOGGLE_TOOLKIT_PANEL` → `setToolkitPanelVisible`, persisted via
`ajaxToolsToolkitPanelVisible`). A collapse (—) button shrinks it to a
minimal circular dot (36px, green dot, no title, no buttons). Both collapsed
and expanded states anchor to the CSS default `right:24px; bottom:24px` — the
panel does NOT remember a drag position across collapse/expand, so toggling
never lands it off-screen. The collapsed dot is not draggable (click expands
it; a drag-suppress flag `panel.dataset.toolkitDragged` ensures a real drag
in expanded state never toggles expand). Hiding the Toolkit panel hides all
sub-panels; the animation popup stays on if it was open (toggle it off inside
before hiding). Disabling Animation Control's master toggle (or leaving the
page) restores every controlled animation to its cached original
`{rate, playState}` via `restoreAnimations` AND lifts the rAF patch.
finished/idle animations are never force-replayed on restore.

**Limitations:** Speed control (playbackRate) applies only to WAAPI-reachable
animations (CSS); JS/rAF-driven animation speed cannot be scrubbed. Pause covers
both via WAAPI + rAF patch. setTimeout-based animation loops are not paused.

---

<!-- NEW FEATURES GO HERE
When adding a core feature, append a new numbered section above this comment
following the same format (Summary / Lives in / Wiring). See governance.md. -->
