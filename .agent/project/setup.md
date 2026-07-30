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

## Build the extension

From the **project root**:

```bash
node build.js              # build workbench + zip, no version change
node build.js --bump       # bump patch version, build, zip
node build.js --publish    # bump + build + zip + GitHub Release
node build.js --publish --commit   # ...also commit + push the bump
node build.js --retry      # re-publish CURRENT version (no bump), implies --force --commit
```

What `build.js` does, in order:

1. Optionally `bumpVersion()`: increments `manifest.json` patch version, sets
   `name` to `MockKit v<version>`, mirrors the version into
   `html/iframePage/package.json` + `package-lock.json`, writes
   `.build-meta.json` for the workbench's `postbuild` changelog step.
2. Runs `npm run build` inside `html/iframePage/` (Vite build → `dist/`).
3. `packageExtension()`: zips the runtime entries only:
   `manifest.json`, `service_worker.js`, `content.js`, `pageScripts/`,
   `icons/`, `html/iframePage/mock.js`, `html/iframePage/dist/`.
   Excludes `.DS_Store` and `dist/CHANGELOG.md`.
4. (optional) `publishToGitHub()`: creates/pushes a `v<version>` tag and a
   GitHub Release with the zip attached. `--force` deletes a stale tag/release
   first.
5. (optional) `commitAndPush()`: `git add -A && git commit -m "chore: v<version>" && git push`.

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
