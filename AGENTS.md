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
```

## Where to look for what

| Topic | File |
| --- | --- |
| Architecture, runtime contexts, message flow | [`.agent/project/context.md`](./.agent/project/context.md) |
| Build, dev, load-into-Chrome, publish | [`.agent/project/setup.md`](./.agent/project/setup.md) |
| Tech stack, modules, data flow, storage keys | [`.agent/project/tech-detail.md`](./.agent/project/tech-detail.md) |
| **Core feature catalog** (living doc, keep in sync) | [`.agent/project/features.md`](./.agent/project/features.md) |
| Code conventions | [`.agent/standards/coding.md`](./.agent/standards/coding.md) |
| **Governance: mandatory doc-sync rule for new features** | [`.agent/standards/governance.md`](./.agent/standards/governance.md) |

## Working agreement (must follow)

1. **Before touching code**, skim `.agent/project/context.md` and
   `.agent/project/tech-detail.md` so you understand the three execution
   contexts (service worker / content script / page script) and the message
   bus between them.
2. **When you add or change a core feature**, you MUST update
   `.agent/project/features.md` in the same change — see
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
  list lives in `.agent/project/tech-detail.md`.
- **No test framework is configured.** Verify changes by loading the extension
  and exercising the relevant flow.

## Non-goals

- This is not a production web app; it is a developer tool. Optimize for
  debugging ergonomics, not for scale.
- Do not add heavy dependencies; the extension zip must stay small.
