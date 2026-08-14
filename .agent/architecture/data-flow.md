# Data Flow — a Rule Firing End-to-End

> Narrative trace of a single mock rule firing, from UI edit to patched
> response. For the architectural context model see
> [`context.md`](./context.md); for lookup tables see
> [`../reference/`](../reference/).

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
   matching floating-panel row green (`refreshFloatingHitDots`). When the
   override is applied, `notifyInterceptSuccess(url)` → `content.js`
   `showInterceptSuccessToast` shows a top-right toast.
6. `emitCapturedRequest` → `content.js` → iframe `useRequestSniffer` lists it.
