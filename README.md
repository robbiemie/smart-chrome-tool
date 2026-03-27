# smart-chrome-tool

`smart-chrome-tool` is a Chrome extension for intercepting network requests, rewriting responses, adjusting request headers, and managing page-level request header rules during frontend debugging.

The extension ships with a React + TypeScript iframe workbench that allows you to:

- Organize interception rules into groups
- Match requests by URL and HTTP method
- Replace response payloads
- Rewrite request URL, method, and headers
- Inject request payload transformation scripts
- Configure current-page request headers with one-click enable and disable
- Import and export rule configurations

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Environment Requirements](#environment-requirements)
- [Local Development](#local-development)
- [Build for Extension Runtime](#build-for-extension-runtime)
- [Load the Extension in Chrome](#load-the-extension-in-chrome)
- [How to Open the Tool](#how-to-open-the-tool)
- [Workbench Overview](#workbench-overview)
- [How to Create and Manage Rule Groups](#how-to-create-and-manage-rule-groups)
- [How to Create and Edit Rules](#how-to-create-and-edit-rules)
- [How Response Rewriting Works](#how-response-rewriting-works)
- [How Request Rewriting Works](#how-request-rewriting-works)
- [How Request Payload Scripts Work](#how-request-payload-scripts-work)
- [How Current Page Headers Work](#how-current-page-headers-work)
- [Import and Export](#import-and-export)
- [Typical Debugging Workflows](#typical-debugging-workflows)
- [Troubleshooting](#troubleshooting)
- [Notes and Limitations](#notes-and-limitations)

## Architecture Overview

This project is a Chrome Manifest V3 extension.

Main runtime pieces:

- `manifest.json`
  Defines permissions, content scripts, background service worker, devtools page, and web accessible resources.
- `service_worker.js`
  Handles background runtime logic and Chrome extension integration.
- `content.js`
  Runs on matched pages and injects runtime capabilities into the page context.
- `devtoolsPage/`
  Provides the DevTools integration entry.
- `html/iframePage/`
  Contains the React + TypeScript iframe application used as the management UI.

The React iframe app is the main operator-facing UI. It is built independently with Vite and then loaded by the extension.

## Project Structure

```text
smart-chrome-tool/
├── manifest.json
├── service_worker.js
├── content.js
├── devtoolsPage/
├── pageScripts/
├── icons/
├── assets/
└── html/
    └── iframePage/
        ├── main/
        │   ├── App.tsx
        │   ├── hooks/
        │   ├── components/
        │   ├── common/
        │   └── types/
        ├── common/
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
3. Reopen DevTools if needed

## How to Open the Tool

This extension integrates with Chrome DevTools.

Typical flow:

1. Open the target webpage.
2. Press `F12` or open Chrome DevTools manually.
3. Locate the extension panel provided by this tool.
4. Open the panel to access the network interception workbench.

If the panel does not appear:

- Confirm the unpacked extension loaded successfully
- Confirm DevTools has been reopened after loading or reloading the extension
- Confirm the iframe app has been built successfully

## Workbench Overview

After the UI refactor, the main screen is organized into three areas:

### 1. Header overview

The top area shows:

- Global status of the interceptor
- Current page header quick-toggle status
- Group count
- Rule count
- Enabled rule count
- Regex rule count

It also exposes quick actions:

- `Create Group`
- `Import JSON`
- `Page Headers`

### 2. Left operations rail

The left panel contains:

- Global interceptor enable/disable switch
- Current page header quick toggle
- Global expand/collapse control
- Group navigator

Use it to switch between groups quickly instead of scanning the full rule list.

### 3. Main workspace

The middle panel is the active group editor. It allows you to:

- Rename a group
- Move a group to top or bottom
- Enable all rules in a group
- Disable all rules in a group
- Remove a group
- Edit rule fields inline
- Open advanced request/response editors

### 4. Right detail panel

The right panel shows the currently focused rule:

- Request matcher
- Replacement URL
- Replacement status code
- Header snapshot
- Payload script
- Response definition

This makes it easier to inspect the active rule without repeatedly opening modal editors.

## How to Create and Manage Rule Groups

### Create a new group

There are multiple entry points:

- Click `Create Group` in the top header
- Click `Add` in the group navigator

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

1. Select the group in the left navigator
2. Edit the title field in the main workspace

Use a clear semantic name. The UI stores the change automatically.

### Reorder groups

Inside the active group header:

- Click `Pin Top` to move the group to the first position
- Click `Send Bottom` to move the group to the last position

### Delete a group

Inside the active group header:

- Click `Remove Group`

Be careful because removing a group also removes all rules inside it from local storage.

### Enable or disable all rules in a group

Inside the active group header:

- Click `Enable All`
- Click `Disable All`

This is useful when you want to quickly compare real backend behavior and mocked behavior.

## How to Create and Edit Rules

### Create a rule

1. Select a group
2. Click `Add Rule`

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

- Click `Enable`
- Click `Disable`

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

Or use:

- `Quick Headers` switch in the left operations rail

### What this feature does

It creates page-origin-based request header rules and synchronizes them through extension storage.

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

The `Quick Headers` switch:

- Enables configured headers immediately if a profile already exists
- Creates a default header rule when enabling without a previous config
- Disables the active page-header rule when switched off

## Import and Export

### Import

Use the `Import JSON` button in the top header.

Import behavior:

- Imported arrays are appended to existing groups
- Existing storage is not automatically wiped

Recommended workflow:

1. Export or back up current rules first
2. Import a JSON file
3. Verify the imported groups in the navigator

### Export

The project contains export utilities in the frontend runtime. If your current UI entry exposes export in the running environment, use it to save the active configuration as JSON for backup or team sharing.

Recommended export scenarios:

- Before large rule changes
- Before deleting groups
- Before switching branch or local environment
- Before sharing a tested mock setup with teammates

## Typical Debugging Workflows

### 1. Mock a static API response

1. Create a group such as `Product Detail Mock`
2. Add a rule
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
2. Open `Page Headers`
3. Add required key/value pairs
4. Save and enable
5. Reload the page and inspect the network panel

### 5. Rewrite request payload for experiments

1. Match a `POST` or `GET` endpoint
2. Open `Payload`
3. Add a script to modify request parameters
4. Save the rule
5. Trigger the UI action and inspect the actual outgoing request

## Troubleshooting

### The extension panel does not appear in DevTools

Check the following:

- The extension is loaded successfully in `chrome://extensions`
- DevTools was reopened after extension reload
- `html/iframePage/dist` exists
- `manifest.json` is valid

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
3. Close and reopen DevTools
4. Refresh the target page

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
