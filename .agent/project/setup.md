# Setup — smart-chrome-tool (MockKit)

> How to develop, build, load, and publish the extension.

## Prerequisites

- **Node.js 16+**
- **npm** (ships with Node)
- **Chrome / Edge** (Chromium-based, for loading the unpacked extension)
- For publishing only: **GitHub CLI** (`brew install gh`) authenticated via
  `gh auth login` (or `GH_TOKEN` env var with `repo` scope).

## Two independent build surfaces

1. **The React workbench** (`html/iframePage/`) — an independent Vite project
   with its own `package.json`, `node_modules`, and `dist/`. The extension
   loads its prebuilt `dist/` at runtime; it is NOT built by the extension.
2. **The extension itself** — plain JS (`service_worker.js`, `content.js`,
   `pageScripts/index.js`) + `manifest.json` + the workbench `dist/`. No
   bundler; files are shipped as-is. `build.js` orchestrates packaging.

## Local development (workbench hot-reload)

```bash
cd html/iframePage
npm install        # first time only
npm start          # Vite dev server on http://localhost:4001
```

For the workbench to be useful standalone it expects a `chrome.storage.local`
context; in a plain browser tab some features degrade gracefully. The
authoritative dev loop is the "hybrid" mode below.

### Hybrid dev loop (recommended)

1. Run `npm start` in `html/iframePage/` (keeps Vite on 4001).
2. Build the workbench once (`npm run build` in that folder, or `node
   build.js` from the root) so `html/iframePage/dist/` exists.
3. Load the extension unpacked (see below).
4. After editing extension JS (`service_worker.js` / `content.js` /
   `pageScripts/index.js`), reload the extension in
   `chrome://extensions` and refresh the target page.
5. After editing React code, Vite HMR updates the dev server; to test against
   the real extension, rebuild `dist/` and reload the extension.

### Dev / Beta build (isolated from production)

```bash
node build-dev.js          # bump patch, build, zip as "MockKit Beta v<next>"
```

`build-dev.js` is a **standalone script** that does NOT share code with
`build.js` and never touches the production publish path. Its contract:

1. Reads `manifest.json`, bumps the patch version (e.g. `0.0.42` → `0.0.43`).
2. Rewrites `name` → `MockKit Beta v<next>` and `version` → `<next>`
   **in memory**, writes it to `manifest.json` temporarily.
3. Runs the Vite workbench build.
4. Zips the runtime into `smart-chrome-tool-beta-v<next>.zip`.
5. **Restores the original `manifest.json` byte-for-byte in a `finally`
   block** — the source tree is never left in a Beta state, even if the build
   crashes. This is the critical isolation guarantee from `build.js`.

The resulting zip shows up as `MockKit Beta v<next>` in `chrome://extensions`,
with an orange `B·ON` / `B·OFF` toolbar badge and a `MockKit Beta v<next>`
DevTools panel tab. Use it to test a higher version than the installed
production copy without polluting the working tree.

### Version model (important)

- **`manifest.json` is the single source of truth.** `package.json` /
  `package-lock.json` are mirrors, synced from manifest before every build.
- Never edit the version in `package.json` directly — `build.js` owns it.
- Plain builds (`node build.js` with no flag) never mutate the version.

## Load the extension into Chrome

1. Build the workbench at least once so `html/iframePage/dist/` exists:
   ```bash
   cd html/iframePage && npm install && npm run build
   ```
2. Open `chrome://extensions`.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** → select the **project root** (the folder
   containing `manifest.json`), NOT `html/iframePage/`.
5. The extension appears as **MockKit v<version>**.

## How to open the tool on a page

- Click the extension's toolbar icon → toggles the iframe workbench visibility
  on the active tab (the SW sends `iframeToggle` to the content script).
- Or use the **floating rules panel** (toggle via the workbench's "Floating
  Rules" switch), which is a lightweight DOM panel rendered by `content.js`
  directly on the page.
- Or open **DevTools** (F12) → **MockKit** tab → mounts the same workbench on
  the inspected page. Useful where the toolbar action's content-script
  auto-injection is gated (e.g. enterprise-managed browsers). Cannot mount on
  `chrome://` / `chrome-extension://` / `about:` pages.

## Publish a new release

```bash
node build.js --publish --commit
```

Prerequisites: `gh` installed and authenticated. `--force` recreates a tag if
it already exists; `--retry` re-publishes the current version without bumping
(useful when a previous publish failed midway).

The release lands at:
`https://github.com/robbiemie/smart-chrome-tool/releases/tag/v<version>`

## Verification (no test suite)

There is no automated test framework. Verify changes by:

1. Rebuilding `dist/` and reloading the extension.
2. Opening a target page and exercising the relevant flow (interception,
  header rules, CSR, DOM inspect, sniffer, update).
3. Checking the service-worker console (`chrome://extensions` → "inspect
  views: service worker`) and the page console for errors.
