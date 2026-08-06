# Core Feature Catalog — smart-chrome-tool (MockKit)

> **This is a living document.** Every agent that adds or changes a core
> feature MUST update this file in the same change — see
> [`../standards/governance.md`](../standards/governance.md).
>
> Format per entry: name, one-line summary, where it lives, how it's wired.
> Keep entries concise; link to source files with `path:line`.

> **Master-switch model:** the Interceptor (`ajaxToolsSwitchOn`) is the single
> master switch. Turning it OFF force-disables every mock sub-feature — Sniffer,
> Floating Rules, Page Headers (DNR) — and they do NOT auto-resume when it is
> turned back on; each must be re-enabled manually.

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
per profile. **Subordinate to the Interceptor master switch** — turning the
Interceptor off flips every header rule's `enabled` flag to false and removes
all DNR dynamic rules; rules do NOT auto-resume when the Interceptor is
re-enabled and must be toggled back on per origin.

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

**Box-model overlay on inspect (hover = full box model, click = lock):** while
inspecting (hovering), a full **box-model overlay** (`mockkit-box-model-overlay`)
renders the margin / border / padding / content stack on the page with value
badges at each edge — no need to click first. Blue dashed margin box + blue
badges (margin T/R/B/L), dark border box outline, green dashed padding box +
green badges (padding T/R/B/L), dotted content outline. Margin and padding
fills use distinct, saturated colors (18% blue vs 18% green) so the two
regions are visually distinguishable at a glance. Zeros are dimmed but shown
so the user can confirm "this side is 0" rather than wondering if a label is
missing. Hidden in measure mode (which has its own overlay semantics).

The overlay structure is built ONCE in `createDomInspectorOverlay` (4 layers
+ 8 labels nested in a container = margin box) and updated IN PLACE every
frame by `updateBoxModelOverlay` via `renderFrame` — zero DOM creation/deletion
per frame, only style + textContent mutations. Appended to `<html>` (never
`<body>`) so page stacking contexts on `<body>` (transform/filter/opacity)
can't trap the fixed-position overlay.

After a node is picked (click), the SAME box-model overlay is locked as the
PERSISTENT picked overlay (`domInspectorState.pickedMarginOverlay`) — created
in `showDomInspectorPanel` via `showPickedMarginOverlay(node)` (reuses
`createBoxModelOverlay` + `updateBoxModelOverlay`), cleared on panel close or
re-pick. Tracks the node on scroll/resize via `repositionPickedMarginOverlay`
(rAF-throttled; updates in place — zero DOM churn). Hover and picked overlays
share the same rendering code, so what you see while hovering is exactly what
you get when you click.

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

**Interceptor is the sole master switch:** the sniffer panel no longer hosts
an in-panel intercept toggle. The Interceptor switch in the workbench's Global
Controls is the only way to turn the master switch on/off — turning it off
force-closes the sniffer panel (see master-switch model at the top of this
file), so an in-panel toggle would be a self-destruct button and was removed.

**Positioning (bottom-left default):** the sniffer panel defaults to the
bottom-left anchor (`left:24px; bottom:24px`) so it never overlaps Floating
Rules (top-right), DOM Inspector (top-left), or Toolkit (bottom-right). It
only moves when the user drags it (`snifferPanelDragged` flag);
`repositionSnifferPanel` clears inline overrides so the CSS default takes over.

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
  `window.requestAnimationFrame` / `setTimeout` / `setInterval` (and their
  cancel counterparts) for queueing stubs so JS animation loops of ALL kinds
  freeze — rAF loops (canvas/WebGL), setTimeout chains, and setInterval
  drivers (carousels/轮播, GSAP tickers, banner rotators). Callbacks
  scheduled during the pause are QUEUED (not dropped) so resuming replays
  them without losing frames; `applyTimerPatch(false)` restores the originals
  and re-schedules queued callbacks via the real timers. Disabling control
  restores the originals too. Keyboard shortcuts (registered once, top frame,
  capture phase) self-gate on the master toggle: `⌘⇧K` toggles pause, `⌘⇧X`
  cycles speed through `[1, 2, 4, 0.5]`. Shortcuts are ignored while focus is
  in an input/textarea/contenteditable.

**Anti-occlusion:** Floating overlays anchor to four distinct corners so they
never overlap: Toolkit (bottom-right), Floating Rules (top-right), Animation
(top-right, stacks below Rules), DOM Inspector (top-left), and Request Sniffer
(bottom-left). When the workbench opens, each overlay floats **above** it via
z-index (`2147483647`, same as the workbench, and appended after it in the DOM
so it stacks on top) rather than dodging left. A single `MutationObserver` on
the workbench container's `style`/`class` (plus a `resize` listener) drives
`repositionFloatingOverlays`, which resets each non-dragged panel to its CSS
default anchor. Each overlay's auto-repositioning is skipped once the user
drags it (`*PanelDragged` flags) so auto-reposition never fights an explicit
placement.

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

**Sub-panel open intent is preserved across Toolkit hide/show:** when
`setToolkitPanelVisible(false)` runs, it hides each open sub-panel's DOM but
does NOT destroy the intent — `toolkitPanelState.*Open` flags stay true, and
`FLOATING_ENABLED_KEY` / `SNIFFER_OPEN_KEY` are NOT overwritten to false.
Re-opening Toolkit (`setToolkitPanelVisible(true)`) reads those flags +
persisted keys back and restores each sub-panel that was on. The restore
guards check ACTUAL panel visibility (`!floatingRulesEnabled`,
`!snifferState.visible`, `animationControlState.panelEl?.style.display === 'none'`)
rather than the intent flags, so a forced-true flag can't mask a still-hidden
panel. Animation has no persisted key — it restores from the in-memory flag
only, so it does not survive a page refresh (consistent with its session-only
design).

**Auto-minimize on sub-panel open:** when the user clicks a sub-tool switch
(Rules / Animation / Sniffer) to ON, the Toolkit master panel auto-collapses
to its dot form via `autoCollapseToolkitForSubPanel` so the expanded panel
gets out of the way once a sub-tool is on screen. This is wired in the switch
click handlers (not in `setToolkit*Open`), so the restore path
(`setToolkitPanelVisible(true)` re-opening sub-panels) does NOT trigger
auto-collapse — Toolkit stays expanded when re-opened so the user can see the
switches. No-op if Toolkit is already collapsed or hidden.

**Default to collapsed on refresh:** on page load, if
`ajaxToolsToolkitPanelVisible` is true, the hydrate callback calls
`setToolkitPanelVisible(true)` immediately followed by
`setToolkitPanelCollapsed(true)`, so the panel re-appears as the collapsed
dot rather than the expanded card. The user clicks the dot to expand.
Sub-panels still restore to their prior open state (driven by the show path).
This keeps the viewport clean on first paint after a refresh.

**Limitations:** Speed control (playbackRate) applies only to WAAPI-reachable
animations (CSS); JS-driven animation speed cannot be scrubbed (only paused).
Pause covers CSS animations via WAAPI AND all JS timer loops (rAF +
setTimeout + setInterval) via the page-script timer patch. Animations driven
by already-scheduled native timers that were queued BEFORE the pause may fire
one last time before the patch takes effect (one-frame latency).

---

## 15. Tooltip suppression (merged into animation pause)

**Summary:** Tooltip freezing is part of the animation pause action — when the
user pauses animations (⌘⇧K or the Pause button), tooltips are frozen too, so
a paused page is fully frozen with no tooltips occluding the inspected node.
No separate toggle; resuming animations also resumes tooltips.

**Mechanism:**
- Capture-phase listeners on `document` call `stopPropagation` (NOT
  `preventDefault`) on `mouseover`, `mouseenter`, `mouseout`, `mouseleave`,
  `focus`, `focusin` — so tooltip libraries (Ant Design / MUI / hover
  libraries) never see the hover/focus events that trigger their show logic.
  Default actions (focus, etc.) still fire so the page keeps working.
- `mousemove` is intentionally NOT blocked (the DOM Inspector needs it).
- Native `title` attributes are temporarily moved to `data-mockkit-title`
  (original value preserved) so the browser's built-in tooltip doesn't show
  either. Restored on resume. New elements added during suppression are NOT
  covered (acceptable — native titles are rare in modern app UIs).
- A transient on-screen badge confirms the combined freeze/resume state.

**Lives in:** `content.js` — `tooltipSuppressed`, `tooltipBlankedElements`
(Set), `tooltipEventHandler`, `setTooltipSuppressed`, `showTooltipSuppressBadge`.
Triggered from `setAnimationPaused` (freeze together) and `setAnimationEnabled(false)` (restore on disable).

**Wiring:**
- ⌘⇧K / Pause button → `setAnimationPaused(next)` → `setTooltipSuppressed(next)`
  → adds/removes capture-phase event listeners + blanks/restores `title` attrs
  → `showTooltipSuppressBadge(state)` for visual feedback.
- Disable Animation Control → `setAnimationEnabled(false)` → `setTooltipSuppressed(false)`
  so the page fully restores.

---

<!-- NEW FEATURES GO HERE
When adding a core feature, append a new numbered section above this comment
following the same format (Summary / Lives in / Wiring). See governance.md. -->

---

## 16. Response delay simulation

**Summary:** Simulate response latency for mocked requests by deferring the
delivery of the overridden response body to the page. Supports a fixed delay
(e.g. `"500"` = 500ms) or a random range (e.g. `"100-500"` = random integer in
[100, 500]ms). Useful for testing loading states, skeleton screens, retry
logic, and timeout handling without modifying application code.

**Lives in:**
- Delay parsing: `pageScripts/index.js` (`ajax_tools_space.parseDelay`) —
  parses the spec string into milliseconds; returns 0 for empty/invalid input
  so a bad value never blocks the page.
- XHR path: `pageScripts/index.js` `myXHR` — in the `onreadystatechange` DONE
  branch, when `parseDelay(matchedInterface.delay) > 0`, wraps
  `modifyResponse` + `emitCapturedRequest` + the page's `onreadystatechange`
  callback in a `setTimeout`. The page perceives a slower round-trip; the
  Sniffer capture is also deferred so its timeline matches what the page
  received.
- Fetch path: `pageScripts/index.js` `myFetch` — after computing `overrideText`
  but before building the `Response`, `await new Promise(r => setTimeout(r,
  delay))` delays the promise resolution. The Sniffer capture is emitted after
  the delay.
- Data model: `html/iframePage/common/value.ts` — `delay: string` field on
  `DefaultInterfaceObject` (default `''` = no delay); `DELAY_PRESETS` array
  for the quick-select buttons.
- Editor: `html/iframePage/main/components/ModifyDataModal/` — Response tab,
  next to Status Code: an `Input` + preset buttons (100ms / 500ms / 1s / 3s /
  random / clear). Tooltip documents the range syntax.
- Persistence: `useRegistry.ts` `onInterfaceListSave` writes `delay` via
  `onInterfaceListChange`, stored in `ajaxDataList` in `chrome.storage.local`.
- Card badge: `GroupWorkbench/index.tsx` — a purple `⏱` Tag is shown when
  `rule.delay` is set, so delayed mocks are visible at a glance.

**Wiring:** User sets delay in ModifyDataModal → `onSave` →
`onInterfaceListChange('delay', value)` → `persistAjaxDataList` →
`chrome.storage.local` → `storage.onChanged` → content.js relays `ajaxDataList`
to page script via `postMessage` → `pageScripts/index.js` reads
`matchedInterface.delay` at request time → `parseDelay` → `setTimeout` /
`await Promise`.

**Scope:** Delay applies ONLY to mocked responses (rules with a `responseText`
that matches). Passthrough (non-matched) requests are never delayed. The delay
field is evaluated per request, so a random range re-rolls on every hit.
