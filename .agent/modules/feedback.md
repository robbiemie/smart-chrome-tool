# Intercept-Success Toast — smart-chrome-tool (MockKit)

> Transient top-right confirmation when a mock response is delivered. Part of
> the feature catalog — see [`README.md`](./README.md) for the index and
> master-switch model.

## Intercept-success toast (§17)

**Summary:** When a mock response is successfully delivered to the page (the
override is applied), a transient global toast appears in the page's top-right
corner confirming the interception. Title is fixed ("Intercepted request
success"); the description shows the intercepted API path (`api: <url>`). This
gives immediate, glanceable confirmation that a mock took effect, complementing
the existing per-rule green dot.

**Lives in:**
- Fire points: `pageScripts/index.js` — `notifyInterceptSuccess(url)` called
  inside the XHR `modifyResponse` responseText-override block and inside the
  fetch `overrideText !== undefined` block (both after the override is applied,
  so the toast reflects when mocked data actually reached the page; both
  naturally respect the master switch since the override is skipped when it is
  off, and after any configured delay).
- Message: `MOCKKIT_INTERCEPT_SUCCESS` (page → content, payload `{url}`).
- Renderer: `content.js` `showInterceptSuccessToast` (+ `ensureInterceptToastStyle`,
  `ensureInterceptToastContainer`). Top-frame only; iframe interceptions do not
  spawn toasts.

**Wiring:** page script override applied → `notifyInterceptSuccess(requestUrl)`
→ `window.postMessage` `MOCKKIT_INTERCEPT_SUCCESS` → content.js message
listener → `showInterceptSuccessToast(url)` → top-right toast.

**Behavior:**
- Stacks up to 5 visible toasts; older toasts are dropped when the cap is
  exceeded.
- Each toast auto-dismisses after 3s (fade-out); click-to-dismiss also works.
- Dedupes rapid repeats: the same URL is not re-toasted within 1.5s, so a burst
  of identical requests does not flood the corner.
- Session-only state (the dedupe map is in-memory); nothing persisted.

**Scope:** Fires ONLY for response-override successes (rules with a
`responseText` that matched and was applied). Request-rewrite-only rules (URL /
method / headers / payload script, no `responseText`) do not fire the toast —
they rewrite the outgoing request but do not deliver a mocked response. The
toast is subordinate to the Interceptor master switch (no override → no toast)
but is NOT subordinate to any panel/Toolkit visibility flag: it shows whenever
an interception succeeds, regardless of whether the floating panel or Toolkit
is open.

**Anti-occlusion note:** The toast container anchors to the same top-right
corner as the Floating Rules panel (`right:24px; top:24px`). The container is
appended on demand (after the panel mounts) and shares the max `z-index`, so
toasts stack above the panel while visible. Overlap is brief (toasts are
transient, ≤3s) and intentional per the "top-right" placement requirement.

---

**Related:** [`interception.md`](./interception.md) (what triggers it) · [`floating-panel.md`](./floating-panel.md) (shared top-right anchor) · [message types](../reference/message-types.md)
