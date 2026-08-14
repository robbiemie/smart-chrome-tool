# Tech Stack — smart-chrome-tool (MockKit)

> Quick reference for the technologies at each layer. For where each piece
> lives, see [`module-map.md`](./module-map.md); for the dev/build flow see
> [`../setup/setup.md`](../setup/setup.md).

| Layer | Tech |
| --- | --- |
| Extension platform | Chrome **Manifest V3** (service worker, content script, declarativeNetRequest) |
| Background | Vanilla JS (`service_worker.js`), no bundler |
| Content script | Vanilla JS (`content.js`), DOM-rendered floating panel + iframe host |
| Page injection | Vanilla JS (`pageScripts/index.js`), monkey-patches XHR/fetch |
| Workbench UI | **React 18** + **TypeScript 4.9** + **Ant Design 4** + **Monaco Editor 0.34** |
| Workbench build | **Vite 2.9** (separate project in `html/iframePage/`) |
| Packaging | `build.js` (Node CLI) → zip; GitHub Releases for distribution |
| Tests | None configured (manual verification) |
