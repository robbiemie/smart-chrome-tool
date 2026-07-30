# Project Context — smart-chrome-tool (MockKit)

> Architecture overview and runtime model. Read this before editing any of the
> three context-bound files (`service_worker.js`, `content.js`,
> `pageScripts/index.js`).

## What it does

A Chrome **Manifest V3** developer tool for frontend debugging. Core
capabilities: intercept & rewrite XHR/fetch responses, rewrite request
URL/method/headers, inject request payload scripts, manage per-page request
headers via `declarativeNetRequest`, toggle CSR mode, capture live requests,
inspect DOM nodes, and self-update from GitHub Releases.

## Three execution contexts (critical mental model)

The extension spans three isolated JS contexts. Each has different privileges
and a different role. Data crosses the boundaries via `window.postMessage` and
`chrome.runtime` messaging — never via shared globals.

### 1. Service worker (`service_worker.js`) — BACKGROUND context

- Has no DOM. Runs the MV3 background worker.
- Owns: `declarativeNetRequest` (DNR) header-rule compilation/sync, CSR mode
  URL rewriting (`__csr=1`), self-update checks against GitHub Releases,
  extension reload, badge ON/OFF.
- Talks to: content scripts via `chrome.tabs.sendMessage` / `chrome.runtime.onMessage`.
- Key invariants: rule IDs are derived deterministically from
  `profileId:ruleId` via `simpleHash` (see `buildRuleId`), range
  `[RULE_ID_BASE, RULE_ID_BASE + RULE_ID_RANGE)`.
- Lifecycle hooks: `onInstalled`, `onStartup`, `alarms` (6h update tick),
  `storage.onChanged` (re-syncs DNR rules when header profiles change).

### 2. Content script (`content.js`) — CONTENT-SCRIPT context (isolated world)

- Runs at `document_start`, `all_frames: true`, on `<all_urls>`.
- Owns: the floating rules panel (rendered as DOM, not React), the DOM
  Inspector (full reimplementation, no DevTools API), the iframe workbench host
  (mounts the React app), domain-whitelist gating, picture-in-picture / zoom /
  fullscreen / theme controls for the panel.
- Holds a runtime mirror of interceptor state on
  `window.__ajaxToolsRuntimeState__` (switch state, domain whitelist, target
  tab id).
- Talks to: the PAGE context via `window.postMessage` (bidirectional), the
  service worker via `chrome.runtime.sendMessage`, and the React iframe via
  `window.postMessage` to the iframe's `contentWindow`.
- Re-injectable on demand: `service_worker.ensurePanelMessageReceiver` can
  `chrome.scripting.executeScript({ files: ['content.js'] })` if a ping fails,
  so the panel can open even on pages that missed the initial load hook.

### 3. Page script (`pageScripts/index.js`) — PAGE context (main world)

- Injected via `injectedScript('pageScripts/index.js')` from `content.js`. Runs
  in the **page's own world**, so it can monkey-patch `XMLHttpRequest` and
  `fetch`.
- Owns: XHR & fetch interception, rule matching (`getMatchedInterface`),
  response override (`getOverrideText`), request rewrite (URL/method/headers),
  request payload script execution (`executeStringFunction`), rule-hit
  notification, and captured-request emission for the Request Sniffer.
- Talks to: the content script only, via `window.postMessage` with
  `to: 'contentScript'`. Never touches `chrome.*` APIs (unavailable here).

### 4. React workbench (`html/iframePage/`) — IFRAME context

- A separate Vite project built to `html/iframePage/dist/`, loaded as an
  `<iframe>` by `content.js`.
- Owns: the full operator UI — group/rule management, Monaco-based advanced
  editor (`ModifyDataModal`), import/export, page-headers modal, CSR toggle,
  update modal, request sniffer list, operations rail.
- Talks to: `content.js` via `window.parent.postMessage`, and to the service
  worker via `chrome.runtime.sendMessage` (the iframe runs in the extension
  origin so it has chrome API access).

## Message flow at a glance

```
PAGE (pageScripts)  ──postMessage──▶  CONTENT (content.js)  ──runtime──▶  SW (service_worker.js)
   XHR/fetch hook                        floating panel                     DNR rules / CSR / update
   rule hit dots                         DOM inspector                      badge
   captured reqs                         iframe host                        reload
        ▲                                    ▲   │
        └──────────postMessage──────────────┘   │ postMessage to iframe
                                                ▼
                                         IFRAME (React workbench)
                                             group/rule UI, Monaco editor,
                                             modals, sniffer list
```

Concrete message types (see `tech-detail.md` for the full table):

- `AJAX_TOOLS_RULE_HIT` (page → content): light up a rule's green dot.
- `AJAX_TOOLS_CAPTURED_REQUEST` (page → content → iframe): feed the sniffer.
- `MOCKKIT_INSPECT_DOM` (iframe → content): trigger DOM inspector pick mode.
- `SYNC_PAGE_HEADERS_RULES` (iframe → SW): recompile DNR rules.
- `GET_PAGE_RENDER_MODE` / `SET_PAGE_RENDER_MODE` (iframe → SW): CSR toggle.
- `CHECK_UPDATE` / `RELOAD_EXTENSION` (iframe → SW): self-update.

## Storage model

Single namespace: `chrome.storage.local`. Keys are prefixed `ajaxTools*`
(legacy/interceptor) and `ajaxToolsHeader*` / `mockkit*` (newer). The React
workbench and the floating panel both read/write the same keys, so
`chrome.storage.onChanged` is the cross-context sync bus. Authoritative key
list: `.agent/project/tech-detail.md`.

## Non-goals / constraints

- MV3 service worker can be killed at any time; never hold mutable state in
  module-level variables that must survive (the SW relies on storage + alarms).
- The page script cannot use `chrome.*`; everything it needs must be relayed.
- The iframe is a third-party frame, so the File System Access API is blocked
  there — the update flow opens a **top-level** extension page (`#update=1…`)
  to run download/unzip/write. See `App.tsx` `isUpdateMode`.
