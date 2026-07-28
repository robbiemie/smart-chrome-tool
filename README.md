# smart-chrome-tool

`smart-chrome-tool` is a Chrome extension for intercepting network requests, rewriting responses, adjusting request headers, and managing page-level request header rules during frontend debugging.

The extension ships with a React + TypeScript iframe workbench that allows you to:

- Organize interception rules into groups
- Match requests by URL and HTTP method
- Replace response payloads
- Rewrite request URL, method, and headers
- Inject request payload transformation scripts
- Configure current-page request headers with one-click enable and disable
- Toggle CSR (client-side rendering) mode for the active tab via a `__csr=1` URL parameter
- Gate the mock layer and floating panel with a domain whitelist
- Import and export rule configurations

## Screenshots

| Mode | Preview |
| --- | --- |
| Fullscreen mode | ![Fullscreen mode](./assets/example1.png) |
| Normal mode | ![Normal mode](./assets/example2.png) |
| Floating rules panel | ![Floating rules panel](./assets/example3.png) |

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Environment Requirements](#environment-requirements)
- [Local Development](#local-development)
- [Build for Extension Runtime](#build-for-extension-runtime)
- [Load the Extension in Chrome](#load-the-extension-in-chrome)
- [How to Open the Tool](#how-to-open-the-tool)
- [Workbench Overview](#workbench-overview)
- [Floating Rules Panel](#floating-rules-panel)
- [Domain Whitelist](#domain-whitelist)
- [How to Create and Manage Rule Groups](#how-to-create-and-manage-rule-groups)
- [How to Create and Edit Rules](#how-to-create-and-edit-rules)
- [How Response Rewriting Works](#how-response-rewriting-works)
- [How Request Rewriting Works](#how-request-rewriting-works)
- [How Request Payload Scripts Work](#how-request-payload-scripts-work)
- [How Current Page Headers Work](#how-current-page-headers-work)
- [How CSR Mode Works](#how-csr-mode-works)
- [Import and Export](#import-and-export)
- [Typical Debugging Workflows](#typical-debugging-workflows)
- [Troubleshooting](#troubleshooting)
- [Notes and Limitations](#notes-and-limitations)

## Architecture Overview

This project is a Chrome Manifest V3 extension.

Main runtime pieces:

- `manifest.json`
  Defines permissions, content scripts, background service worker, and web accessible resources.
- `service_worker.js`
  Handles background runtime logic and Chrome extension integration.
- `content.js`
  Runs on matched pages and injects runtime capabilities into the page context.
- `html/iframePage/`
  Contains the React + TypeScript iframe application used as the management UI.

The React iframe app is the main operator-facing UI. It is built independently with Vite and then loaded by the extension.

## Project Structure

```text
smart-chrome-tool/
├── manifest.json
├── service_worker.js
├── content.js
├── build.js
├── pageScripts/
├── icons/
├── assets/
└── html/
    └── iframePage/
        ├── main/
        │   ├── App.tsx
        │   ├── index.tsx
        │   ├── hooks/
        │   ├── components/
        │   ├── common/
        │   ├── pages/
        │   ├── types/
        │   └── utils/
        ├── common/
        ├── declarativeNetRequest/
        ├── index.html
        ├── package.json
        └── vite.config.js
```

Important frontend files:

- `html/iframePage/main/App.tsx`
  Main workbench entry after the UI refactor.
- `html/iframePage/main/hooks/useRegistry.ts`
  Core rule-group storage and mutation logic.
- `html/iframePage/main/hooks/usePageHeaders.ts`
  Current-page header profile management logic.
- `html/iframePage/main/hooks/usePageRenderMode.ts`
  CSR mode toggle logic for the active tab.
- `html/iframePage/main/components/OperationsRail/`
  Left rail with global interceptor switch, CSR mode switch, and group selector.
- `html/iframePage/main/components/WorkbenchHeader/`
  Top header with status tags, Import JSON, and Page Headers entry points.
- `html/iframePage/main/components/GroupWorkbench/`
  Active group editor with rule cards, Add Rule, and Remove Group.
- `html/iframePage/main/components/RuleDetailPanel/`
  Right detail panel for the focused rule with Edit Response / Edit Request / Edit Payload.
- `html/iframePage/main/components/ModifyDataModal/`
  Advanced request and response editor modal backed by Monaco Editor.

## Environment Requirements

Recommended environment:

- Node.js `16+`
- npm `8+`
- Chrome or Chromium with Developer Mode enabled

This repository currently manages the iframe frontend dependencies inside `html/iframePage`.

## Local Development

### 1. Install frontend dependencies

Run the following command in the iframe app directory:

```bash
cd html/iframePage
npm install
```

### 2. Start the iframe app in development mode

```bash
npm run start
```

The Vite dev server runs on:

```text
http://localhost:4001
```

This is useful for iterating on the React UI itself. If you are changing the extension runtime behavior, you still need to reload the unpacked extension in Chrome.

## Build for Extension Runtime

The extension uses the built iframe assets inside `html/iframePage/dist`.

Build the iframe app:

```bash
cd html/iframePage
npm run build
```

After a successful build, Vite outputs the compiled files into:

```text
html/iframePage/dist
```

This folder is referenced by `manifest.json` as a web accessible resource.

## Load the Extension in Chrome

### 1. Build the iframe app first

```bash
cd html/iframePage
npm run build
```

### 2. Open Chrome extension management

Open:

```text
chrome://extensions
```

### 3. Enable Developer Mode

Turn on the `Developer mode` toggle in the top-right corner.

### 4. Load the repository as an unpacked extension

Click `Load unpacked` and select the project root directory:

```text
smart-chrome-tool/
```

### 5. Reload after code changes

When you change extension runtime files such as `manifest.json`, `service_worker.js`, or `content.js`, click `Reload` in `chrome://extensions`.

When you change the iframe React app:

1. Rebuild `html/iframePage`
2. Reload the extension
3. Refresh the target page and reopen the workbench

## How to Open the Tool

The workbench is surfaced as a side panel injected into the active page.

Typical flow:

1. Open the target webpage.
2. Click the extension's toolbar icon (the `Ajax Interceptor Tools` action icon).
3. The workbench panel slides in from the right side of the page.
4. Click the toolbar icon again (or the panel's close button) to hide it.

If the panel does not appear:

- Confirm the unpacked extension loaded successfully
- Confirm the active tab is a normal http/https page (the panel cannot be injected into `chrome://` pages)
- Confirm the iframe app has been built successfully (`html/iframePage/dist` exists)
- Reload the page after reloading the extension

## Workbench Overview

After the UI refactor, the main screen is organized into four areas:

### 1. Header overview

The top area (`WorkbenchHeader`, labeled `Rewrite Console`) shows:

- Interceptor status tag (`Interceptor Live` / `Interceptor Paused`)
- Page headers status tag (`Headers Armed` / `Headers Idle`)
- Group count, rule count, and enabled rule count

The `Import JSON` and `Page Headers` entry points now live in the left operations rail (as `Import` and `Headers`).

### 2. Left operations rail

The left panel (`OperationsRail` / `Global Controls`) contains:

- `Interceptor` switch — global interceptor enable/disable
- `CSR Mode` switch — toggle CSR mode for the active tab
- `Floating Rules` switch — master toggle for the [floating rules overlay](#floating-rules-panel)
- `Collapse All` / `Expand All` — collapse or expand the group workbench and rule detail panel together
- `Import` — import a JSON ruleset
- `Headers` — open the current-page headers editor
- `Domain Whitelist` — edit the [domain whitelist](#domain-whitelist) and see whether the current tab is matched
- `Groups` selector — dropdown to switch between groups with an `Add` button to create a new group

Use it to switch between groups quickly instead of scanning the full rule list.

### 3. Main workspace

The middle panel (`GroupWorkbench`) is the active group editor. It allows you to:

- Edit the group summary text
- Add a new rule via `Add Rule`
- Remove the group via `Remove Group`
- Edit rule fields inline
- Open advanced request/response editors from each rule card

### 4. Right detail panel

The right panel (`RuleDetailPanel`) shows the currently focused rule:

- Request matcher
- Replacement URL
- Replacement status code
- Header snapshot
- Payload script
- Response definition

It also exposes `Edit Response`, `Edit Request`, and `Edit Payload` shortcuts so you can inspect the active rule without repeatedly opening modal editors.

## Floating Rules Panel

Independent of the main side panel, a floating rules overlay is rendered at the bottom-right corner of the page (see [Screenshot - Floating rules panel](#screenshots)). It lets you toggle and edit rules for the active group without keeping the full workbench open.

### Visibility rules

- It only renders on hostnames that match the [Domain Whitelist](#domain-whitelist).
- The master switch lives in the left operations rail under `Floating Rules`. Turning it off hides the overlay everywhere.
- The overlay is independent of the main side panel: collapsing the workbench does not hide it.

### Header actions

- The header is **draggable** — reposition the panel anywhere in the viewport. The position is kept in memory only and resets to the bottom-right corner on page reload.
- The `CSR` / `SSR` pill switches the active tab's render mode in one click (equivalent to the `CSR Mode` switch in the rail).
- The `—` button collapses the panel into a compact 3x3 mock grid widget showing the enabled/total rule count at a glance. Click the grid to expand.

### Rule rows

- Each row shows the matched URL and an optional note.
- A custom pill toggle enables/disables the rule (writes back to storage, so the workbench stays in sync).
- An `Edit` button appears on hover — clicking it reveals the main side panel and opens the edit modal for that rule.

## Domain Whitelist

The mock layer (XHR/fetch override) and the floating rules panel are gated by a domain whitelist so the extension never silently intercepts traffic on unintended sites.

### Default behavior

- The whitelist ships with `*`, which matches every hostname. Out of the box the extension behaves as before.
- If you remove every entry, the list falls back to `*` so the extension never blocks all pages by accident.

### Supported patterns

| Pattern | Matches |
| --- | --- |
| `*` | All hostnames |
| `foo.com` | `foo.com` exactly |
| `*.foo.com` | `foo.com` and any subdomain (`a.foo.com`, `a.b.foo.com`) |
| `a*.foo.com` | hostnames starting with `a` under `foo.com` (`ab.foo.com`, `ac.foo.com`) |

Patterns are case-insensitive.

### How to configure

1. Open the extension workbench.
2. In the left operations rail, find the **Domain Whitelist** card.
3. The current tab's hostname is shown with a live `✓ matched` / `✕ blocked` indicator.
4. Add a new pattern in the input and press Enter (or click the `+` button).
5. Remove a pattern by clicking the `×` on its tag.

### What is gated

- **pageScripts/index.js** only overrides `XMLHttpRequest` and `fetch` when `currentHostWhitelisted()` returns true.
- **content.js** hides the floating rules panel on non-matched hostnames.
- The whitelist is persisted under `ajaxToolsDomainWhitelist` and broadcast to the page script via `storage.onChanged`, so changes take effect on the next request without a reload.

## How to Create and Manage Rule Groups

### Create a new group

There are multiple entry points:

- Click `Add` next to the `Groups` selector in the left operations rail
- The currently selected group is the one new rules will be added to

Each group is a container for related rules. A good convention is to group rules by:

- Business domain
- Page module
- API system
- Debugging scenario

Examples:

- `Checkout Mock APIs`
- `User Center Overrides`
- `Local Sandbox Rules`
- `Temporary Release Verification`

### Rename a group

1. Select the group in the left operations rail
2. Edit the summary text field in the main workspace

Use a clear semantic name. The UI stores the change automatically.

### Delete a group

Inside the active group header:

- Click `Remove Group`

Be careful because removing a group also removes all rules inside it from local storage.

### Enable or disable rules within a group

Each rule has its own enable switch on the rule card. Toggle it individually to control whether that rule takes effect.

This is useful when you want to quickly compare real backend behavior and mocked behavior.

## How to Create and Edit Rules

### Create a rule

1. Select a group
2. Click `Add Rule` inside the active group workspace

Each rule contains several important fields.

### Match Type

Supported values:

- `regex`
- `normal`

Use `regex` when:

- You need pattern matching
- The request URL contains variable segments
- One rule should match multiple similar endpoints

Use `normal` when:

- The request URL is stable
- You want exact or simpler matching behavior

### Method

Supported common methods include:

- `GET`
- `POST`
- `PUT`
- `DELETE`
- `PATCH`
- Empty value for any method

If you leave it empty, the rule is less strict and may match more requests.

### Request Matcher

This field is the core URL matching input.

Examples:

```text
https://api.example.com/user/profile
```

```text
/api/order/list
```

```text
^https://api\.example\.com/v1/items/.*
```

### Rule Notes

Use this to document the purpose of the rule, for example:

- `Force empty cart state`
- `Mock user level to VIP`
- `Simulate order create failure`

This becomes especially valuable when many temporary rules exist in the same environment.

### Enable or disable a single rule

Inside each rule card:

- Toggle the rule's enable switch

Disabling a rule keeps the configuration but stops it from taking effect.

### Move a rule

Inside each rule card toolbar:

- Move to top
- Move to bottom

Use this when you want important rules to stay visually near the top of a group.

### Delete a rule

Inside each rule card toolbar:

- Click the delete icon

## How Response Rewriting Works

Click `Response` on a rule card or `Edit Response` in the right detail panel.

The modal lets you configure:

- Replacement status code
- Replacement response body
- Response language mode

### Supported response authoring modes

The editor supports at least:

- `json`
- `javascript`

### JSON mode

Use JSON mode when the response is static and predictable.

Example:

```json
{
  "status": 200,
  "response": {
    "name": "debug-user",
    "role": "admin"
  }
}
```

### JavaScript mode

Use JavaScript mode when the response should be dynamic.

Example:

```javascript
const data = [];

for (let index = 0; index < 5; index += 1) {
  data.push({
    id: index,
    label: `item-${index}`
  });
}

return {
  status: 200,
  response: data
};
```

Typical use cases:

- Return different responses by request parameters
- Simulate empty states
- Simulate paginated responses
- Simulate error branches
- Rebuild nested objects quickly for UI testing

## How Request Rewriting Works

Click `Request` on a rule card or `Edit Request` in the right detail panel.

This editor is for upstream request rewriting before the response handling phase.

Available capabilities:

- Replace request method
- Replace request URL
- Replace request headers

### Replace request method

You can change the outgoing method, for example:

- `POST` to `GET`
- `GET` to `POST`

Use this carefully because it can change backend semantics significantly.

### Replace request URL

You can redirect a request to another endpoint.

Example:

```text
https://mock.example.com/api/user/detail
```

Typical use cases:

- Redirect production-like traffic to a mock server
- Redirect one endpoint to another existing endpoint
- Route requests to local test services

### Replace request headers

Headers are edited as JSON.

Example:

```json
{
  "Content-Type": "application/json",
  "x-debug-mode": "1",
  "x-user-role": "tester"
}
```

Common use cases:

- Add auth-like headers for staging
- Add debug switches for backend branches
- Simulate special user identities

## How Request Payload Scripts Work

Click `Payload` on a rule card or `Edit Payload` in the right detail panel.

This editor accepts JavaScript and is used to transform request payloads before they are sent.

Typical scenarios:

- Add extra query parameters
- Modify JSON body fields
- Append `FormData` values
- Simulate special filters or feature switches

### Example: rewrite query string for GET requests

```javascript
const { requestUrl, queryStringParameters } = arguments[0];

let nextRequestUrl = requestUrl.split('?')[0] + '?';
const nextQuery = Object.assign(queryStringParameters, {
  debugMode: '1'
});

Object.keys(nextQuery).forEach((key, index) => {
  if (index !== 0) nextRequestUrl += '&';
  nextRequestUrl += `${key}=${nextQuery[key]}`;
});

return nextRequestUrl;
```

### Example: modify JSON body for POST

```javascript
const payload = JSON.parse(arguments[0]);

payload.role = 'tester';
payload.featureFlag = true;

return JSON.stringify(payload);
```

### Example: append data to FormData

```javascript
const payload = arguments[0];

payload.append('debugMode', '1');

return payload;
```

## How Current Page Headers Work

The workbench provides a separate capability for current-page request headers.

Open it by:

- Clicking `Page Headers` in the top header

The page origin is passed to the iframe via a `pageOrigin` query parameter, and rules are stored per origin in extension local storage under the `ajaxToolsHeaderProfiles` key.

### What this feature does

It creates page-origin-based request header rules and synchronizes them through extension storage as `declarativeNetRequest` dynamic rules.

This is useful when you want a temporary header policy for one site, for example:

- Force a debug token
- Add preview environment markers
- Enable backend experiment flags

### How to configure current page headers

1. Open the target page
2. Open the extension workbench
3. Click `Page Headers`
4. Turn the feature on
5. Add header key/value pairs
6. Click `Save`

Example:

```text
Header Key: x-debug-mode
Header Value: 1
```

### How quick toggle works

The `Quick Headers` switch in the left operations rail:

- Enables configured headers immediately if a profile already exists
- Creates a default header rule (`x-debug-mode: 1`) when enabling without a previous config
- Disables the active page-header rule when switched off

## How CSR Mode Works

The left operations rail exposes a `CSR Mode` switch that toggles client-side rendering mode for the active tab.

### What this feature does

When enabled, the extension appends a `__csr=1` query parameter to the current tab URL through `chrome.tabs.update`. When disabled, the parameter is removed. The page then reloads with the new URL so the backend or page runtime can pick up the render mode.

This is useful when the target site branches its rendering pipeline (SSR vs CSR) based on the presence of `__csr`, and you want to force the CSR branch for debugging without editing the URL by hand.

### How to use it

1. Open the target page
2. Open the extension workbench (click the extension toolbar icon)
3. In the left operations rail, toggle `CSR Mode`
4. The tab reloads with the updated URL

### Notes

- The toggle sends a `SET_PAGE_RENDER_MODE` message to the background service worker, which performs the tab navigation.
- The current state is read from the active tab URL via `GET_PAGE_RENDER_MODE`.
- If no target tab can be resolved, an error notification is shown.

## Import and Export

### Import

Use the `Import JSON` button in the top header.

Import behavior:

- Imported arrays are appended to existing groups
- Existing storage is not automatically wiped

Recommended workflow:

1. Export or back up current rules first
2. Import a JSON file
3. Verify the imported groups in the groups selector

### Export

The project contains export utilities in the frontend runtime. If your current UI entry exposes export in the running environment, use it to save the active configuration as JSON for backup or team sharing.

Recommended export scenarios:

- Before large rule changes
- Before deleting groups
- Before switching branch or local environment
- Before sharing a tested mock setup with teammates

## Typical Debugging Workflows

### 1. Mock a static API response

1. In the left operations rail, click `Add` next to `Groups` to create a group such as `Product Detail Mock`
2. In the main workspace, click `Add Rule`
3. Set the request matcher to the target API
4. Open `Response`
5. Enter a JSON response
6. Enable the rule
7. Refresh the page and verify UI behavior

### 2. Simulate an empty state

1. Match the list API
2. Replace the response with an empty array or empty object
3. Verify whether the UI empty state is correct

Example:

```json
{
  "status": 200,
  "response": []
}
```

### 3. Simulate a backend error

1. Match the target API
2. Open `Response`
3. Change the status code to `500` or another expected code
4. Return an error-shaped payload
5. Verify error toast, fallback UI, and retry logic

### 4. Force request headers for one environment

1. Open the target page
2. Open `Page Headers` from the top header
3. Add required key/value pairs
4. Save and enable
5. Reload the page and inspect the network panel

### 5. Rewrite request payload for experiments

1. Match a `POST` or `GET` endpoint
2. Open `Payload`
3. Add a script to modify request parameters
4. Save the rule
5. Trigger the UI action and inspect the actual outgoing request

### 6. Force CSR rendering for debugging

1. Open the target page
2. Open the extension workbench (click the extension toolbar icon)
3. In the left operations rail, toggle `CSR Mode` on
4. The tab reloads with `__csr=1` and the page enters its CSR branch

## Troubleshooting

### The workbench panel does not appear

Check the following:

- The extension is loaded successfully in `chrome://extensions`
- The active tab is a normal http/https page (the panel cannot open on `chrome://` pages)
- `html/iframePage/dist` exists
- `manifest.json` is valid
- Reload the page after reloading the extension

### Rules do not take effect

Check the following:

- The global interceptor switch is enabled
- The individual rule is enabled
- The request matcher is correct
- The method filter is correct
- The current page actually sends the request you expect
- The extension was reloaded after runtime changes

### Page headers do not take effect

Check the following:

- The page origin is valid
- The page-header feature is enabled
- The header keys are not empty
- The extension has been granted host permissions

### Build succeeds but the extension still shows old UI

Check the following:

1. Rebuild the iframe app
2. Reload the unpacked extension
3. Refresh the target page
4. Click the extension toolbar icon again to reopen the workbench

### `npm install` or `npm run build` fails

Check the following:

- Node.js version compatibility
- npm registry configuration
- Local network access
- Dependency lockfile state

## Notes and Limitations

- This project depends on Chrome extension APIs and is intended for Chromium-based browsers.
- The iframe app is built separately and must exist in `html/iframePage/dist` for extension runtime usage.
- Monaco Editor makes the bundle relatively large. This is expected for now.
- Rule data is stored in Chrome local storage, so clearing extension storage can remove saved rules.
- Page header rules are persisted under `ajaxToolsHeaderProfiles` and applied as `declarativeNetRequest` dynamic rules.
- CSR Mode simply toggles the `__csr=1` query parameter on the active tab; whether it has any effect depends on the target site.
- Request and response rewriting are powerful features. Use them carefully in shared environments.

## Recommended Operating Conventions

For long-term maintainability of rule data, use these conventions:

- Keep one business domain per group
- Add meaningful rule notes
- Disable obsolete rules instead of keeping ambiguous active rules
- Export important rule sets before large changes
- Prefix temporary groups with names like `TEMP`, `DEBUG`, or `VERIFY`

## License

See [LICENSE](./LICENSE).
