# Tech Detail — smart-chrome-tool (MockKit)

> Tech stack, module map, data flow, storage keys, and message types. The
> reference agents reach for when asking "where does X live?".

## Tech stack

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

## Module map

### `service_worker.js` (background)
| Concern | Entry points |
| --- | --- |
| DNR header rules | `compileDynamicRules`, `syncHeaderRules`, `ensureHeaderProfilesStorage`, `migrateLegacyPageHeaders` |
| CSR mode | `getPageRenderMode`, `setPageRenderMode`, `buildRenderModeUrl` (toggles `__csr=1` query param) |
| Self-update | `checkForUpdate`, `fetchLatestRelease` (+ `fetchLatestReleaseViaHtml` fallback), `compareVersions` |
| Badge | `setSwitchBadge` (ON/OFF) |
| Message router | `chrome.runtime.onMessage` for `SYNC_PAGE_HEADERS_RULES`, `GET/SET_PAGE_RENDER_MODE`, `CHECK_UPDATE`, `RELOAD_EXTENSION`, `SET_GITHUB_TOKEN` |
| Panel bootstrap | `ensurePanelMessageReceiver` (re-injects `content.js` on demand) |

### `content.js` (content script)
| Concern | Entry points |
| --- | --- |
| Domain whitelist | `patternToRegExp`, `isHostnameWhitelisted`, `currentHostWhitelisted` |
| Script/style injection | `injectedScript`, `injectedCss`, `injectedStyle` |
| DOM Inspector | `startDomInspector`/`stopDomInspector`, `pickDomNode`, `showDomInspectorPanel`, `buildBoxModelDiagram`, `readComputedStyles`/`readCoreStyles`/`readBoxModel`, `bindDomInspectorDrag` |
| Floating rules panel | `createFloatingRulesPanel`, `renderFloatingRules`, `refreshFloatingHitDots`, `createFloatingCsrButton`, `createFloatingInspectButton`, `bindFloatingPanelDrag` |
| Panel chrome buttons | `zoomButton`, `fullscreenButton`, `pipButton`, `themeModeButton`, `discussionsButton`, `codeNetButton`, `newTabButton`, `actionBar` |
| Iframe host | `createPanelContainer`, `bindPanelMessageListener`, `mountPanelContainer`, `initPanelMount` |
| Runtime state | `ajaxToolsRuntimeState` on `window.__ajaxToolsRuntimeState__` |

### `pageScripts/index.js` (page context)
| Concern | Entry points |
| --- | --- |
| State holder | `ajax_tools_space` (switch, rules, whitelist, `originalXHR`) |
| Rule matching | `getMatchedInterface`, `strToRegExp`, `getRequestParams` |
| Response override | `getOverrideText` (supports JSON or function-string) |
| Payload script | `executeStringFunction` (`new Function(stringFunction)(args)`) |
| Notifications | `notifyRuleHit` (→ content for green dot), `emitCapturedRequest` (→ sniffer) |
| Header normalization | `normalizeHeadersToObject` |
| XHR/fetch patch | (lower in file) wraps `window.XMLHttpRequest` and `window.fetch` |

### React workbench (`html/iframePage/main/`)
| File | Role |
| --- | --- |
| `App.tsx` | Root: composes rails + workbench + modals; handles update-mode rendering |
| `hooks/useRegistry.ts` | Rule-group storage & mutations (add/move/delete/import/save) |
| `hooks/usePageHeaders.ts` | Per-page header profile management |
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

## Data flow: a rule firing end-to-end

1. User edits a rule in the React `ModifyDataModal` → `useRegistry` persists to
   `chrome.storage.local.ajaxDataList`.
2. `chrome.storage.onChanged` fires → `content.js` re-reads and
   `postMessage({type:'ajaxTools', key:'ajaxDataList', value})` to the page
   script; the page script stores it on `ajax_tools_space.ajaxDataList`.
3. Page makes an XHR/fetch → patched handler calls `getMatchedInterface`.
4. On match: response is overridden via `getOverrideText`; request may be
   rewritten (URL/method/headers); payload script may run via
   `executeStringFunction`.
5. `notifyRuleHit(ruleKey)` → `window.postMessage` → `content.js` lights the
   matching floating-panel row green (`refreshFloatingHitDots`).
6. `emitCapturedRequest` → `content.js` → iframe `useRequestSniffer` lists it.

## Storage keys (authoritative)

All in `chrome.storage.local`. Prefixes: `ajaxTools*` (legacy/interceptor),
`ajaxToolsHeader*` / `mockkit*` (newer).

| Key | Type | Owner | Purpose |
| --- | --- | --- | --- |
| `ajaxDataList` | `AjaxGroup[]` | workbench + page script | All rule groups & rules |
| `ajaxToolsSwitchOn` | `boolean` | workbench + SW | Global interceptor switch |
| `ajaxToolsSwitchOnNot200` | `boolean` | workbench + page script | Intercept non-200 only |
| `ajaxToolsSkin` | `'light'\|'dark'` | workbench | Theme |
| `ajaxToolsExpandAll` | `boolean` | workbench | Expand-all collapse state |
| `ajaxToolsSelectedGroupIndex` | `number` | workbench | Active group |
| `ajaxToolsDomainWhitelist` | `string[]` | workbench + content | Domain patterns (`*` = all) |
| `iframeVisible` | `boolean` | content + SW | Workbench iframe visibility |
| `ajaxToolsHeaderProfiles` | `Profile[]` | workbench + SW | Page-header profiles (DNR source) |
| `ajaxToolsManagedHeaderRuleIds` | `number[]` | SW | DNR rule IDs we manage (for cleanup) |
| `ajaxToolsWorkbenchTargetTabId` | `number` | SW | Tab the workbench controls |
| `ajaxToolsUpdateLastCheckAt` | `number` | SW | Last update-check timestamp |
| `ajaxToolsUpdateAvailable` | `object\|null` | SW | Latest release info / badge source |
| `ajaxToolsGithubToken` | `string` | SW | Optional PAT to lift API rate limits |
| `ajaxToolsFloatingRulesEnabled` | `boolean` | content | Floating panel on/off (close button flips this to false) |
| `ajaxToolsPageHeadersMap` | `object` | (legacy) | Pre-profiles header map; migrated on read |

## Message types (cross-context)

### `window.postMessage` (page ↔ content ↔ iframe)

| Type | Direction | Payload | Effect |
| --- | --- | --- | --- |
| `ajaxTools` (key/value) | content → page | `{key, value}` | Push config to page script |
| `AJAX_TOOLS_RULE_HIT` | page → content | `{ruleKey}` | Green dot on matching rule |
| `AJAX_TOOLS_CAPTURED_REQUEST` | page → content → iframe | `{method,url,status,responseText,...}` | Feed sniffer |
| `MOCKKIT_INSPECT_DOM` | iframe → content | — | Start DOM inspector pick mode |
| `AJAX_TOOLS_OPEN_EDIT` | content → iframe | `{groupIndex, ruleIndex}` | Open `ModifyDataModal` for a rule |
| `AJAX_TOOLS_APPLY_UPDATE` | content → iframe | `{downloadUrl, remoteVersion}` | Open `UpdateModal` |
| `iframeToggle` | SW → content | `{iframeVisible}` | Toggle workbench visibility |
| `PING_AJAX_TOOLS_PANEL` | SW → content | — | Liveness check before re-inject |

### `chrome.runtime` messaging (iframe/SW ↔ SW)

| Type | Direction | Effect |
| --- | --- | --- |
| `SYNC_PAGE_HEADERS_RULES` | iframe → SW | Recompile & apply DNR rules |
| `GET_PAGE_RENDER_MODE` | iframe → SW | Read `__csr` state of target tab |
| `SET_PAGE_RENDER_MODE` | iframe → SW | Toggle `__csr=1` on target tab |
| `CHECK_UPDATE` | iframe → SW | Force/cached update check |
| `RELOAD_EXTENSION` | iframe → SW | Reload extension + target tab |
| `SET_GITHUB_TOKEN` | iframe → SW | Persist optional PAT |

## DNR rule-ID model

- Base: `RULE_ID_BASE = 930000`, range size `RULE_ID_RANGE = 70000`.
- ID = `930000 + (simpleHash(profileId:ruleId) % 70000)`, bumped +1 on
  collision. Tracked in `ajaxToolsManagedHeaderRuleIds` for clean removal.
- Supported resource types: `main_frame`, `sub_frame`, `xmlhttprequest`.
- Forbidden request headers (browser-managed) are filtered in
  `FORBIDDEN_REQUEST_HEADERS` + `shouldSkipHeaderKey` (`proxy-*`, `sec-*`).
