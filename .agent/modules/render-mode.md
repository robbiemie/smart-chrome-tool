# Render Mode (CSR toggle) — smart-chrome-tool (MockKit)

> Toggle client-side rendering for the active tab. Part of the feature catalog
> — see [`README.md`](./README.md) for the index and master-switch model.

## CSR mode toggle (§5)

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

**Related:** [`page-headers.md`](./page-headers.md) (other SW-owned toggle) · [message types](../reference/message-types.md)
