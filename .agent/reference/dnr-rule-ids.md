# DNR Rule-ID Model — smart-chrome-tool (MockKit)

> How `declarativeNetRequest` rule IDs are derived for per-page header rules.
> See [`../modules/page-headers.md`](../modules/page-headers.md) for the
> feature and the SW entry points in [`module-map.md`](./module-map.md).

- Base: `RULE_ID_BASE = 930000`, range size `RULE_ID_RANGE = 70000`.
- ID = `930000 + (simpleHash(profileId:ruleId) % 70000)`, bumped +1 on
  collision. Tracked in `ajaxToolsManagedHeaderRuleIds` for clean removal.
- Supported resource types: `main_frame`, `sub_frame`, `xmlhttprequest`.
- Forbidden request headers (browser-managed) are filtered in
  `FORBIDDEN_REQUEST_HEADERS` + `shouldSkipHeaderKey` (`proxy-*`, `sec-*`).
