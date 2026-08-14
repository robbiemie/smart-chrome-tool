# Message Types — smart-chrome-tool (MockKit)

> Cross-context message catalog. **When you add a message type, add a row
> here** (see [`../standards/governance.md`](../standards/governance.md)). For
> the architectural message-flow diagram, see
> [`../architecture/context.md`](../architecture/context.md).

## `window.postMessage` (page ↔ content ↔ iframe)

| Type | Direction | Payload | Effect |
| --- | --- | --- | --- |
| `ajaxTools` (key/value) | content → page | `{key, value}` | Push config to page script |
| `AJAX_TOOLS_RULE_HIT` | page → content | `{ruleKey}` | Green dot on matching rule |
| `MOCKKIT_INTERCEPT_SUCCESS` | page → content | `{url}` | Top-right intercept-success toast |
| `AJAX_TOOLS_CAPTURED_REQUEST` | page → content → iframe | `{method,url,status,responseText,...}` | Feed sniffer |
| `MOCKKIT_INSPECT_DOM` | iframe → content | — | Start DOM inspector pick mode |
| `AJAX_TOOLS_OPEN_EDIT` | content → iframe | `{groupIndex, ruleIndex}` | Open `ModifyDataModal` for a rule |
| `AJAX_TOOLS_APPLY_UPDATE` | content → iframe | `{downloadUrl, remoteVersion}` | Open `UpdateModal` |
| `iframeToggle` | SW → content | `{iframeVisible}` | Toggle workbench visibility |
| `PING_AJAX_TOOLS_PANEL` | SW → content | — | Liveness check before re-inject |

## `chrome.runtime` messaging (iframe/SW ↔ SW)

| Type | Direction | Effect |
| --- | --- | --- |
| `SYNC_PAGE_HEADERS_RULES` | iframe → SW | Recompile & apply DNR rules |
| `GET_PAGE_RENDER_MODE` | iframe → SW | Read `__csr` state of target tab |
| `SET_PAGE_RENDER_MODE` | iframe → SW | Toggle `__csr=1` on target tab |
| `CHECK_UPDATE` | iframe → SW | Force/cached update check |
| `RELOAD_EXTENSION` | iframe → SW | Reload extension + target tab |
| `SET_GITHUB_TOKEN` | iframe → SW | Persist optional PAT |
