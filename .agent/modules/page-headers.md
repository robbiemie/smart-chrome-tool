# Page Headers (declarativeNetRequest) — smart-chrome-tool (MockKit)

> Per-origin request header rules compiled into MV3 DNR dynamic rules. Part of
> the feature catalog — see [`README.md`](./README.md) for the index and
> master-switch model.

## Per-page request header rules (§4)

**Summary:** Set/remove request headers per origin using MV3
`declarativeNetRequest` dynamic rules. Compiled from header profiles in the SW;
applies even when the page script can't (e.g. cross-origin). One-click enable
per profile. **Subordinate to the Interceptor master switch** — turning the
Interceptor off flips every header rule's `enabled` flag to false and removes
all DNR dynamic rules; rules do NOT auto-resume when the Interceptor is
re-enabled and must be toggled back on per origin.

**Match scope (`matchMode`):** each rule's `condition.matchMode` controls which
requests from the page get the header:
- `'all'` (default for NEW rules): DNR condition uses `initiatorDomains:
  [hostname]`, so EVERY request initiated by the page is matched —
  cross-origin XHR/fetch/sub_frame included. Lets a single header (e.g.
  `x-debug-mode: 1`) ride on API calls to a different host than the page.
- `'sameOrigin'`: DNR condition uses `urlFilter: ||hostname^`, so only requests
  TARGETING the page's own host are matched (original pre-feature behavior;
  also the implicit default for rules saved before this field existed and for
  legacy `ajaxToolsPageHeadersMap` migrations, to avoid surprising existing
  configs).

The scope is chosen in `PageHeadersModal` via a Radio (`All requests` /
`Same-origin only`) and stored on the rule condition; the SW `buildRuleCondition`
picks the DNR condition shape. Note: in `'all'` mode, the page's own top-level
navigation (`main_frame` from a direct URL/reload) may not match
`initiatorDomains` (no initiator) — XHR/fetch/sub_frame (the debug targets) do.

**Cross-origin header reuse:** every saved origin's header set automatically
enters a reuse pool. When the user opens Page Headers on a NEW origin (no rule
yet), a "Reuse headers from another origin…" dropdown lists every OTHER
enabled origin's header set (preview `key:val, … (origin)`). Picking one fills
the editor (headerPairs + matchMode) without saving — the user can tweak then
Save to persist it as the current origin's own rule. This keeps per-origin
isolation (each origin still owns its own rule) while making previously-built
header sets one-click reachable on new sites. Sources are read-only in the
dropdown; deleting an origin's rule (by saving with empty headers) drops it
from the pool. The dropdown is hidden when no other enabled origins have
headers.

**Lives in:**
- Rule compilation: `service_worker.js` (`compileDynamicRules`,
  `buildRuleCondition`, `getRuleHostname`, `syncHeaderRules`, `buildRuleId`,
  `normalizeHeaderOperations`)
- Storage: `ajaxToolsHeaderProfiles`, `ajaxToolsManagedHeaderRuleIds`
- UI: `html/iframePage/main/components/PageHeadersModal/` (match-mode Radio,
  reuse `Select`),
  `hooks/usePageHeaders.ts` (`HeaderMatchMode`, `matchMode` state,
  `ReusableHeaderSource`, `reusableSources`, `applySource`)
- Sync trigger: `SYNC_PAGE_HEADERS_RULES` message + `storage.onChanged`

**Rule-ID model:** `930000 + hash(profileId:ruleId) % 70000`; forbidden headers
filtered (`FORBIDDEN_REQUEST_HEADERS`). See
[`../reference/dnr-rule-ids.md`](../reference/dnr-rule-ids.md).

---

**Related:** [`render-mode.md`](./render-mode.md) (other SW-owned toggle) · [DNR rule-ID model](../reference/dnr-rule-ids.md) · [storage keys](../reference/storage-keys.md)
