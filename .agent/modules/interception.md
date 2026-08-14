# Interception & Rewriting — smart-chrome-tool (MockKit)

> Core mock layer: override and rewrite XHR/fetch traffic on the page. Part of
> the feature catalog — see [`README.md`](./README.md) for the index and
> master-switch model.

## Response interception & rewriting (§1)

**Summary:** Override XHR/fetch response bodies for matched requests, by URL +
method, using literal substring or regex matching. Override text can be raw
JSON or a function string executed against request args.

**Lives in:**
- Matching & override: `pageScripts/index.js` (`getMatchedInterface`,
  `getOverrideText`, `executeStringFunction`)
- Rule storage & UI: `html/iframePage/main/hooks/useRegistry.ts`,
  `components/ModifyDataModal/`
- Config push: `content.js` (relays `ajaxDataList` to page script)

**Wiring:** Workbench → `chrome.storage.local.ajaxDataList` →
`storage.onChanged` → content `postMessage` → page script → patched XHR/fetch.

---

## Request rewriting — URL / method / headers (§2)

**Summary:** For a matched rule, rewrite the outgoing request URL, HTTP
method, and/or headers before the request leaves the page.

**Lives in:**
- Patched XHR/fetch open/send: `pageScripts/index.js`
- Editor: `html/iframePage/main/components/ModifyDataModal/` (Request tab)
- Type: `ModifyDataModalOpenProps` (`replacementMethod`, `replacementUrl`,
  `headersText`) in `main/types/registry.ts`

---

## Request payload script injection (§3)

**Summary:** Run a user-supplied JS function string against the parsed request
params before sending, to dynamically transform the payload.

**Lives in:**
- `pageScripts/index.js` → `executeStringFunction`, `getRequestParams`
- Editor: `ModifyDataModal` (Request tab, `requestPayloadText`)

---

## Response delay simulation (§15)

**Summary:** Simulate response latency for mocked requests by deferring the
delivery of the overridden response body to the page. Supports a fixed delay
(e.g. `"500"` = 500ms) or a random range (e.g. `"100-500"` = random integer in
[100, 500]ms). Useful for testing loading states, skeleton screens, retry
logic, and timeout handling without modifying application code.

**Lives in:**
- Delay parsing: `pageScripts/index.js` (`ajax_tools_space.parseDelay`) —
  parses the spec string into milliseconds; returns 0 for empty/invalid input
  so a bad value never blocks the page.
- XHR path: `pageScripts/index.js` `myXHR` — in the `onreadystatechange` DONE
  branch, when `parseDelay(matchedInterface.delay) > 0`, wraps
  `modifyResponse` + `emitCapturedRequest` + the page's `onreadystatechange`
  callback in a `setTimeout`. The page perceives a slower round-trip; the
  Sniffer capture is also deferred so its timeline matches what the page
  received.
- Fetch path: `pageScripts/index.js` `myFetch` — after computing `overrideText`
  but before building the `Response`, `await new Promise(r => setTimeout(r,
  delay))` delays the promise resolution. The Sniffer capture is emitted after
  the delay.
- Data model: `html/iframePage/common/value.ts` — `delay: string` field on
  `DefaultInterfaceObject` (default `''` = no delay); `DELAY_PRESETS` array
  for the quick-select buttons.
- Editor: `html/iframePage/main/components/ModifyDataModal/` — Response tab,
  next to Status Code: an `Input` + preset buttons (100ms / 500ms / 1s / 3s /
  random / clear). Tooltip documents the range syntax.
- Persistence: `useRegistry.ts` `onInterfaceListSave` writes `delay` via
  `onInterfaceListChange`, stored in `ajaxDataList` in `chrome.storage.local`.
- Card badge: `GroupWorkbench/index.tsx` — a purple `⏱` Tag is shown when
  `rule.delay` is set, so delayed mocks are visible at a glance.

**Wiring:** User sets delay in ModifyDataModal → `onSave` →
`onInterfaceListChange('delay', value)` → `persistAjaxDataList` →
`chrome.storage.local` → `storage.onChanged` → content.js relays `ajaxDataList`
to page script via `postMessage` → `pageScripts/index.js` reads
`matchedInterface.delay` at request time → `parseDelay` → `setTimeout` /
`await Promise`.

**Scope:** Delay applies ONLY to mocked responses (rules with a `responseText`
that matches). Passthrough (non-matched) requests are never delayed. The delay
field is evaluated per request, so a random range re-rolls on every hit.

---

**Related:** [`request-sniffer.md`](./request-sniffer.md) (delay defers sniffer capture too) · [storage keys](../reference/storage-keys.md) (`ajaxDataList`)
