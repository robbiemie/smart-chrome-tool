# AGENTS.md — smart-chrome-tool

> This file is the agent entry point. It follows the cross-tool `AGENTS.md`
> convention (read by Codex, Cursor, Claude Code, logoscode, etc.) and points to
> the structured context under `.agent/`. Read this first, then load the
> relevant `.agent/**/*.md` files on demand.

## What this project is

`smart-chrome-tool` (shipped as **MockKit**) is a Chrome **Manifest V3** extension
for frontend debugging. It intercepts/rewrites XHR & fetch responses, rewrites
request URL/method/headers, injects request payload scripts, manages per-page
request-header rules via `declarativeNetRequest`, toggles CSR mode, captures
live requests, inspects DOM nodes, and self-updates from GitHub Releases.

## Tech stack in one line

Chrome MV3 (service worker + content script + injected page script) hosting a
**React 18 + TypeScript + Ant Design 4 + Monaco Editor** iframe workbench built
with **Vite 2**.

## Repo layout (essentials)

```
smart-chrome-tool/
├── manifest.json            # MV3 manifest — single source of truth for version
├── service_worker.js        # Background: DNR header rules, CSR mode, self-update
├── content.js               # Content script: floating panel, DOM inspector, iframe host
├── pageScripts/index.js     # Injected into PAGE context: XHR/fetch interception
├── build.js                 # Build/bump/zip/publish CLI
├── html/iframePage/         # React + TS workbench (independent Vite project)
│   ├── main/                # App entry, hooks, components, types, utils
│   │   ├── App.tsx
│   │   ├── hooks/           # useRegistry, usePageHeaders, usePageRenderMode, ...
│   │   └── components/      # OperationsRail, GroupWorkbench, ModifyDataModal, ...
│   ├── common/              # Shared types & defaults (value.ts)
│   └── package.json
└── .agent/                  # ← Structured agent context (read these)
    ├── README.md            # Navigation index — start here
    ├── architecture/        # context.md (runtime model), data-flow.md
    ├── setup/               # setup.md (build / dev / load / publish)
    ├── reference/           # tech-stack, module-map, storage-keys, message-types, dnr-rule-ids
    ├── modules/             # Feature catalog — one file per module + README index
    └── standards/           # coding.md, governance.md (doc-sync rule)
```

## Where to look for what

| Topic | File |
| --- | --- |
| Navigation index (start here) | [`.agent/README.md`](./.agent/README.md) |
| Architecture, runtime contexts, message flow | [`.agent/architecture/context.md`](./.agent/architecture/context.md) |
| End-to-end rule-firing data flow | [`.agent/architecture/data-flow.md`](./.agent/architecture/data-flow.md) |
| Build, dev, load-into-Chrome, publish | [`.agent/setup/setup.md`](./.agent/setup/setup.md) |
| Tech stack & module map | [`.agent/reference/tech-stack.md`](./.agent/reference/tech-stack.md) · [`module-map.md`](./.agent/reference/module-map.md) |
| Storage keys & message types (lookup) | [`.agent/reference/storage-keys.md`](./.agent/reference/storage-keys.md) · [`message-types.md`](./.agent/reference/message-types.md) |
| **Core feature catalog** (living doc, keep in sync) | [`.agent/modules/README.md`](./.agent/modules/README.md) (index → per-module files) |
| Code conventions | [`.agent/standards/coding.md`](./.agent/standards/coding.md) |
| **Governance: mandatory doc-sync rule for new features** | [`.agent/standards/governance.md`](./.agent/standards/governance.md) |

## Working agreement (must follow)

1. **Before touching code**, skim [`.agent/architecture/context.md`](./.agent/architecture/context.md)
   and [`.agent/reference/module-map.md`](./.agent/reference/module-map.md) so
   you understand the three execution contexts (service worker / content
   script / page script) and the message bus between them.
2. **When you add or change a core feature**, you MUST update the relevant
   file in [`.agent/modules/`](./.agent/modules/) (and its index row in
   [`modules/README.md`](./.agent/modules/README.md)) in the same change — see
   [`.agent/standards/governance.md`](./.agent/standards/governance.md). This is
   the "auto-supplement" contract: the doc stays alive because every agent
   edits it on every feature change.
3. Follow [`.agent/standards/coding.md`](./.agent/standards/coding.md) for
   naming, comments, and file placement. New React components go in their own
   folder; existing patterns are the authority.

## Quick facts agents often need

- **Version source of truth:** `manifest.json` `version` (and `name` =
  `MockKit v<version>`). `package.json` mirrors it; never edit package version
  directly.
- **Build:** `node build.js` (plain), `node build.js --bump` (bump+build+zip),
  `node build.js --publish` (+ GitHub Release), `--commit` to commit+push.
- **Dev server:** `npm start` inside `html/iframePage/` → Vite on port 4001.
- **Load unpacked:** `chrome://extensions` → Developer mode → Load unpacked →
  pick project root (must contain rebuilt `html/iframePage/dist`).
- **Storage keys** are prefixed `ajaxTools*` / `mockkit*`; the authoritative
  list lives in [`.agent/reference/storage-keys.md`](./.agent/reference/storage-keys.md).
- **No test framework is configured.** Verify changes by loading the extension
  and exercising the relevant flow.

## Non-goals

- This is not a production web app; it is a developer tool. Optimize for
  debugging ergonomics, not for scale.
- Do not add heavy dependencies; the extension zip must stay small.
