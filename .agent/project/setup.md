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

### DevTools panel dev loop (fixed workflow)

The DevTools panel (`devtools.html` / `devtools.js` / `panel.html` /
`panel.js`) is invisible to "load unpacked" unless the source `manifest.json`
carries a `devtools_page` field AND the extension is reloaded AND any already
open DevTools window is fully closed and reopened. The sequence below is the
agreed fixed workflow — follow it every time you iterate on the panel.

```bash
# 1. Temporarily bump the source manifest to a Beta name + higher version so
#    Chrome treats the reload as an upgrade (same version = no reload) and
#    the Beta badge shows in the toolbar / panel tab.
#    Edit manifest.json:
#      "name": "MockKit Beta v0.0.43",
#      "version": "0.0.43",
#    (use a patch number higher than the installed production copy)

# 2. Rebuild the workbench so html/iframePage/dist/ is fresh.
cd html/iframePage && npm run build

# 3. In Chrome:
#    a. chrome://extensions  ->  find MockKit  ->  click the reload icon ⟳
#       (MUST be done; otherwise the new devtools_page is not picked up)
#    b. Fully CLOSE any already-open DevTools window on the target page.
#       (Open DevTools windows do not discover newly registered panels.)
#    c. Reopen DevTools (F12) on an http/https page.
#       The "MockKit Beta v0.0.43" tab appears next to Elements/Console/Network.

# 4. After iterating on panel/devtools files, repeat step 3 only
#    (no rebuild needed unless service_worker.js / content.js / iframe code changed).

# 5. When done: RESTORE manifest.json to the production state, otherwise the
#    next `node build.js` will ship a Beta-named package.
#      "name": "MockKit v0.0.42",
#      "version": "0.0.42",
```

**Why the version bump is mandatory for panel testing:** Chrome does not
reload an unpacked extension's manifest fields (including `devtools_page`)
when the file content is unchanged and the version number is the same. Bumping
the patch version forces Chrome to treat the reload as an upgrade and re-read
the manifest. The bump is reverted in step 5 so the source tree stays clean
for production builds.

**Alternative (zip-based, no source pollution):** `node build-dev.js` produces
`smart-chrome-tool-beta-v<next>.zip` with a bumped version and Beta name
baked into the zip only; the source `manifest.json` is restored automatically
via a `try/finally`. Drag the zip into `chrome://extensions`. Use this when
you do not want the working tree to hold a Beta manifest between iterations.

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
   `manifest.json`, `service_worker.js`, `content.js`, `devtools.html`,
   `devtools.js`, `panel.html`, `panel.js`, `pageScripts/`,
   `icons/`, `html/iframePage/mock.js`, `html/iframePage/dist/`.
   Excludes `.DS_Store` and `dist/CHANGELOG.md`.
4. (optional) `publishToGitHub()`: creates/pushes a `v<version>` tag and a
   GitHub Release with the zip attached. `--force` deletes a stale tag/release
   first.
5. (optional) `commitAndPush()`: `git add -A && git commit -m "chore: v<version>" && git push`.

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
