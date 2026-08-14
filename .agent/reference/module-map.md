# Module Map — smart-chrome-tool (MockKit)

> Entry-point index per runtime file. The reference agents reach for when
> asking "where does X live?". For the high-level architecture and the three
> execution contexts, see [`../architecture/context.md`](../architecture/context.md).

## `service_worker.js` (background)
| Concern | Entry points |
| --- | --- |
| DNR header rules | `compileDynamicRules`, `syncHeaderRules`, `ensureHeaderProfilesStorage`, `migrateLegacyPageHeaders` |
| CSR mode | `getPageRenderMode`, `setPageRenderMode`, `buildRenderModeUrl` (toggles `__csr=1` query param) |
| Self-update | `checkForUpdate`, `fetchLatestRelease` (+ `fetchLatestReleaseViaHtml` fallback), `compareVersions` |
| Badge | `setSwitchBadge` (ON/OFF) |
| Message router | `chrome.runtime.onMessage` for `SYNC_PAGE_HEADERS_RULES`, `GET/SET_PAGE_RENDER_MODE`, `CHECK_UPDATE`, `RELOAD_EXTENSION`, `SET_GITHUB_TOKEN` |
| Panel bootstrap | `ensurePanelMessageReceiver` (re-injects `content.js` on demand) |

## `content.js` (content script)
| Concern | Entry points |
| --- | --- |
| Domain whitelist | `patternToRegExp`, `isHostnameWhitelisted`, `currentHostWhitelisted` |
| Script/style injection | `injectedScript`, `injectedCss`, `injectedStyle` |
| DOM Inspector | `startDomInspector`/`stopDomInspector`, `pickDomNode`, `showDomInspectorPanel`, `buildBoxModelDiagram`, `readComputedStyles`/`readCoreStyles`/`readBoxModel`, `bindDomInspectorDrag` |
| Floating rules panel | `createFloatingRulesPanel`, `renderFloatingRules`, `refreshFloatingHitDots`, `createFloatingCsrButton`, `createFloatingInspectButton`, `bindFloatingPanelDrag` |
| Panel chrome buttons | `zoomButton`, `fullscreenButton`, `pipButton`, `themeModeButton`, `discussionsButton`, `codeNetButton`, `newTabButton`, `actionBar` |
| Iframe host | `createPanelContainer`, `bindPanelMessageListener`, `mountPanelContainer`, `initPanelMount` |
| Runtime state | `ajaxToolsRuntimeState` on `window.__ajaxToolsRuntimeState__` |

## `pageScripts/index.js` (page context)
| Concern | Entry points |
| --- | --- |
| State holder | `ajax_tools_space` (switch, rules, whitelist, `originalXHR`) |
| Rule matching | `getMatchedInterface`, `strToRegExp`, `getRequestParams` |
| Response override | `getOverrideText` (supports JSON or function-string) |
| Payload script | `executeStringFunction` (`new Function(stringFunction)(args)`) |
| Notifications | `notifyRuleHit` (→ content for green dot), `notifyInterceptSuccess` (→ content for top-right toast), `emitCapturedRequest` (→ sniffer) |
| Header normalization | `normalizeHeadersToObject` |
| XHR/fetch patch | (lower in file) wraps `window.XMLHttpRequest` and `window.fetch` |

## React workbench (`html/iframePage/main/`)
| File | Role |
| --- | --- |
| `App.tsx` | Root: composes rails + workbench + modals; handles update-mode rendering |
| `devtools.ts` | DevTools panel registration (`chrome.devtools.panels.create`) |
| `hooks/useRegistry.ts` | Rule-group storage & mutations (add/move/delete/import/save) |
| `hooks/usePageHeaders.ts` | Per-page header profile management (DevTools fallback via `inspectedWindow.eval`) |
| `hooks/usePageRenderMode.ts` | CSR mode toggle (talks to SW) |
| `hooks/useFloatingRules.ts` | Floating panel enable/disable |
| `hooks/useDomainWhitelist.ts` | Domain whitelist CRUD |
| `hooks/useRequestSniffer.ts` | Live-captured request list |
| `hooks/useModuleCollapseState.ts` | Per-module collapse persistence |
| `hooks/useWorkbenchMetrics.ts` | Aggregate stats |
| `hooks/useToggle.ts` | Global interceptor switch + expand-all |
| `components/OperationsRail/` | Left rail: global switches, domain whitelist, sniffer |
| `components/GroupWorkbench/` | Active group editor + rule cards |
| `components/ModifyDataModal/` | Monaco-backed advanced request/response editor |
| `components/BatchImportExport/` | JSON backup/restore |
| `components/PageHeadersModal/` | Page header profile editor |
| `components/UpdateModal/` | Self-update download/unzip/write UI (File System Access API) |
| `components/RequestSniffer/` | Captured traffic list with mock-promotion |
| `components/Footer/` | Status + update check entry |
| `common/value.ts` | Shared types (`AjaxDataListObject`, `DefaultInterfaceObject`) + defaults |
| `types/registry.ts` | `AjaxGroup`, `AjaxRule`, `WorkbenchMetrics`, `ModifyDataModalOpenProps` |
| `utils/selfUpdate.ts` | Download/unzip/write logic |
| `utils/pictureInPicture.ts` | PiP for the workbench |
| `utils/importJson.tsx` / `exportJson.tsx` | JSON I/O |
