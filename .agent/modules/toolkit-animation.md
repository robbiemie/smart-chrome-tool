# Toolkit Panel & Animation Control — smart-chrome-tool (MockKit)

> Floating debug hub consolidating auxiliary tools, plus animation freeze
> (with tooltip suppression). Part of the feature catalog — see
> [`README.md`](./README.md) for the index and master-switch model.

## Toolkit Panel & Animation Control (§13)

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
- **Request Sniffer** (switch): shows/hides the live-capture panel (see [`request-sniffer.md`](./request-sniffer.md)).

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

## Tooltip suppression (merged into animation pause) (§14)

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

**Related:** [`floating-panel.md`](./floating-panel.md) · [`dom-inspector.md`](./dom-inspector.md) · [`request-sniffer.md`](./request-sniffer.md) (Toolkit sub-tools)
