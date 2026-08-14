# Access Control (Domain Whitelist) — smart-chrome-tool (MockKit)

> Gate the mock layer and floating panel to specific host patterns. Part of the
> feature catalog — see [`README.md`](./README.md) for the index and
> master-switch model.

## Domain whitelist (§6)

**Summary:** Gate the mock layer and floating panel to specific host patterns
(`*`, `*.foo.com`, `api.foo.com`). Default `['*']` = all hosts.

**Lives in:**
- Matching: `content.js` (`patternToRegExp`, `isHostnameWhitelisted`,
  `currentHostWhitelisted`, `applyFloatingPanelState`)
- Storage: `ajaxToolsDomainWhitelist`
- UI: `html/iframePage/main/hooks/useDomainWhitelist.ts`,
  `components/OperationsRail/` (Domain Whitelist section)

---

**Related:** [`floating-panel.md`](./floating-panel.md) (auto-adds host on enable) · [storage keys](../reference/storage-keys.md)
