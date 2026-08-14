# Storage Keys — smart-chrome-tool (MockKit)

> Authoritative list of `chrome.storage.local` keys. **When you add a key,
> add a row here** (see [`../standards/governance.md`](../standards/governance.md)).

All keys live in `chrome.storage.local`. Prefixes: `ajaxTools*`
(legacy/interceptor), `ajaxToolsHeader*` / `mockkit*` (newer).

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
