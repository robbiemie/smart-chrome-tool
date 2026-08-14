# DOM Inspector — smart-chrome-tool (MockKit)

> Self-contained DevTools-style element inspector with inspect, measure,
> mark-by-class, and hide-elements sub-modules. Part of the feature catalog —
> see [`README.md`](./README.md) for the index and master-switch model.

## DOM Inspector (§8)

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

### Mark by Class (sub-module)

An independent module at the bottom of the DOM Inspector panel (below Element
Box / Computed Styles). The user types a CSS class name (without the dot) and
presses Enter or clicks "Mark" — every matching element on the page gets a
purple outline (`#7c3aed`) with a numbered badge in the top-left corner. A
status line shows the match count (e.g. "3 elements marked .foo — press Esc to
clear"). Autocomplete suggestions are built on first input focus from the
page's unique class names (capped at 200 entries). Marks are cleared via Esc
or a "Clear" button. Overlays persist on `document.body` across panel rebuilds
and are repositioned on scroll/resize via a rAF-throttled handler. State lives
in `domInspectorState` (`markOverlays`, `markBadges`, `markInputValue`,
`markClassName`, `markKeyListener`).

**Lives in:** `content.js` (`buildMarkByClassModule`, `applyClassMarks`,
`clearClassMarks`, `repositionClassMarks`, `scheduleMarkReposition`); CSS
classes `mockkit-dom-inspector__mark-*`.

### Hide Elements (sub-module)

AdBlock-style element hiding, located below Mark by Class in the DOM Inspector
panel. Maintains a list of CSS selectors compiled into a single `<style
id="mockkit-hide-style">` tag with `display:none!important` — so hidden
elements stay hidden even if the page re-renders or dynamically injects new
matches (CSS selector matching is live, no MutationObserver needed). Three
ways to add entries:
- **Inspect panel "Hide" button** (next to the picked selector): generates
  the most natural selector for the picked node via `generateSelectorForNode`
  — prefers `#id` (if unique), then `.class1.class2` (hits all matching,
  AdBlock-style), then a `tag:nth-of-type(n) > …` path (max 5 levels).
- **Mark by Class "Hide marked" button**: promotes the current mark class
  into a Hide entry (`.className`), bridging non-destructive marking to
  destructive hiding.
- **Manual CSS selector input**: any valid CSS selector (e.g. `div.ad >
  span`, `#promo, .banner`). Press Enter or click Add.

Each list row shows: source icon (◎ picked / ◆ class / ⌨ manual), selector
text (truncated, monospace), live match count badge, ON/OFF toggle, and ×
delete. **Hovering a row** draws orange overlays (`#d4380d`) on every matched
element so the user can preview exactly what a selector will hide before
toggling — overlays are repositioned on scroll/resize via a rAF-throttled
handler (same pattern as Mark by Class). Toggle temporarily disables an entry
without removing it; × removes the entry and restores display. "Clear all"
wipes the entire list.

**Per-host persistence:** hide entries ARE persisted across page reloads,
keyed by `window.location.hostname` in `ajaxToolsHideProfiles`
(`{ [hostname]: { entries: HideEntry[], masterEnabled: boolean } }`). Each
site gets its own hide list — navigating to a different host swaps the active
hiding rules. `loadHideProfile` runs on init (before the DOM Inspector panel
is ever opened) so the `<style>` is applied immediately on page load, not only
after the user opens the panel. Every mutation (add/remove/toggle/clear/master)
calls `persistHideProfile` (read-modify-write to preserve other hosts'
profiles). A `storage.onChanged` listener re-hydrates on external changes
(another tab editing the same host's list). The hide `<style>` and entries
persist across DOM Inspector panel rebuilds (picking another node rebuilds the
panel but keeps hiding active). Esc clears marks but NOT hide entries (avoid
accidental mass-restore); use "Clear all" or per-row × to restore.

**Color theme:** red-orange (`#d4380d`) throughout — module title, buttons,
preview overlays, status — to visually distinguish from the purple Mark module
(non-destructive) and signal that hiding is a destructive action.

**Lives in:** `content.js` (`buildHideElementsModule`, `renderHideList`,
`addHideEntry`, `removeHideEntry`, `toggleHideEntry`, `clearHideEntries`,
`toggleHideMaster`, `generateSelectorForNode`, `ensureHideStyleEl`,
`rewriteHideStyle`, `previewHideEntry`, `clearHidePreview`,
`repositionHidePreview`, `scheduleHidePreviewReposition`,
`countHideEntryMatches`, `loadHideProfile`, `persistHideProfile`,
`getHideHostKey`); storage key `ajaxToolsHideProfiles` (`HIDE_PROFILES_KEY`);
state in `domInspectorState` (`hideEntries`, `hideStyleEl`,
`hideMasterEnabled`, `hidePreviewOverlays`, `hidePreviewFrame`,
`hideRepositionListenersBound`, `hideNextId`); CSS classes
`mockkit-dom-inspector__hide-*`.

---

**Related:** [`floating-panel.md`](./floating-panel.md) (separate inspect entry) · [storage keys](../reference/storage-keys.md) (`ajaxToolsHideProfiles`)
