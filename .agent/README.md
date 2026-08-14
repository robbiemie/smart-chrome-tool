# .agent/ — Structured Agent Context

> Navigation index for agent-facing docs. Start here, then open the file that
> matches your task. This folder is read by Codex, Cursor, Claude Code,
> logoscode, etc. via the root [`../AGENTS.md`](../AGENTS.md).

## Map

| Folder | What's inside | Read it when... |
| --- | --- | --- |
| [`architecture/`](./architecture/) | `context.md` (runtime model, 3 execution contexts, message flow), `data-flow.md` (rule firing end-to-end) | You're about to edit `service_worker.js` / `content.js` / `pageScripts/index.js` or any cross-context flow |
| [`setup/`](./setup/) | `setup.md` (prereqs, dev loop, build, load, publish, verification) | You need to build, run, load, or publish the extension |
| [`reference/`](./reference/) | `tech-stack.md`, `module-map.md`, `storage-keys.md`, `message-types.md`, `dnr-rule-ids.md` | You need to look up "where does X live?" / a storage key / a message type |
| [`modules/`](./modules/) | One file per feature module + `README.md` index (living catalog) | You're adding/changing a feature — update the matching module file |
| [`standards/`](./standards/) | `coding.md` (conventions), `governance.md` (mandatory doc-sync rule) | Before writing code; before finishing a feature change |

## Suggested reading order for a new agent

1. [`architecture/context.md`](./architecture/context.md) — the three-context
   mental model (the #1 source of bugs is crossing a context boundary wrong).
2. [`reference/module-map.md`](./reference/module-map.md) — entry points per
   runtime file.
3. [`modules/README.md`](./modules/README.md) — feature index + master-switch
   model, then the module file(s) relevant to your task.
4. [`standards/governance.md`](./standards/governance.md) — the doc-sync rule
   you must follow when changing a feature.

## Conventions

- Docs are Markdown; keep them concise and link with relative paths.
- The feature catalog under [`modules/`](./modules/) is a **living doc** — every
  feature change must update it (see
  [`standards/governance.md`](./standards/governance.md)).
- Lookup tables under [`reference/`](./reference/) are append-as-you-go: add a
  row whenever you add a storage key, message type, or runtime module.
