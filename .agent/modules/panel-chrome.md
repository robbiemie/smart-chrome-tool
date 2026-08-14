# Workbench Panel Chrome — smart-chrome-tool (MockKit)

> Toolbar affordances on the mounted iframe panel. Part of the feature catalog
> — see [`README.md`](./README.md) for the index and master-switch model.

## Workbench panel chrome — zoom / fullscreen / PiP / theme (§12)

**Summary:** Toolbar buttons on the mounted iframe panel: zoom, fullscreen,
picture-in-picture, dark-theme (invert), open-in-new-tab, discussions, code-net.

**Lives in:** `content.js` (`actionBar`, `zoomButton`, `fullscreenButton`,
`pipButton`, `themeModeButton`, `newTabButton`, `discussionsButton`,
`codeNetButton`); PiP util `html/iframePage/main/utils/pictureInPicture.ts`.

---

**Related:** [`devtools-panel.md`](./devtools-panel.md) (cleaner chrome in DevTools) · [module map](../reference/module-map.md)
