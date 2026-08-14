# Governance — Documentation Sync Rule

> **Mandatory rule for every agent (human or AI) working on this repo.**
> This is the mechanism that keeps the `.agent/modules/` feature catalog alive
> without a separate "docs maintenance" step.

## Design-first for non-trivial features

**Before implementing a non-trivial feature (new UI module, new cross-context
flow, new storage-backed setting), confirm the interaction design with the
user first.** "Non-trivial" = anything with more than one reasonable design
shape (e.g. one-click tool vs. conversational assistant; pull vs. push sync;
modal vs. inline).

Why: this repo has no CI gate and no tests, so a wrong design is only caught
after full implementation + manual load — expensive rework. A 30-second design
confirmation (sketch the data flow + UI shape in text, ask "this direction?")
saves a full rewrite. Do NOT doc-sync the module docs until the design is
stable — rewriting the doc on every design pivot is wasteful.

Trivial changes (bug fix, style tweak, adding a field to an existing modal)
skip this step.

## The rule

**When you add, remove, or materially change a core feature, you MUST update
the relevant module file in `.agent/modules/` (and the index in
`modules/README.md`) in the same change set.**

"Core feature" = any user-facing capability that an agent would need to know
about to understand the project: a new interception mode, a new panel, a new
storage-backed setting, a new message flow, a new toolbar action, etc.

A pure refactor, bug fix, or style tweak that does not change behavior does
NOT require a doc update.

## Why

- [`modules/README.md`](../modules/README.md) is the index every agent reads
  first to orient itself. If it drifts, every subsequent agent starts with a
  wrong model.
- There is no CI gate; the contract is social + enforced by this instruction.
  Treating it as part of the change (like a test) is what keeps it accurate.

## How to update the module docs

The feature catalog lives in [`.agent/modules/`](../modules/) — one file per
module, indexed by [`modules/README.md`](../modules/README.md).

1. Decide which existing module file the feature belongs to. If none fits,
   create a new `modules/<name>.md` (one cohesive capability per file).
2. Append a section to that module file using the standard format:
   ```markdown
   ## <Feature name> (§N)

   **Summary:** One or two sentences: what it does.

   **Lives in:**
   - `path/to/file.js` (`functionName`, ...)
   - `path/to/Component/` (what it renders)

   **Wiring:** Brief data/flow notes (storage key, message types, triggers).
   ```
3. Add (or update) a row in the index table in
   [`modules/README.md`](../modules/README.md).
4. Reference source with `path:line` where it aids navigation.

## Companion updates

If your feature introduces any of these, also update:

| You added... | Also update |
| --- | --- |
| A new `chrome.storage` key | [`../reference/storage-keys.md`](../reference/storage-keys.md) |
| A new cross-context message type | [`../reference/message-types.md`](../reference/message-types.md) |
| A new runtime file or major module | [`../reference/module-map.md`](../reference/module-map.md) |
| A new permission in `manifest.json` | [`../architecture/context.md`](../architecture/context.md) (note it) |
| A new build/publish flag | [`../setup/setup.md`](../setup/setup.md) → Build section |

## Third-party API integration — verify before shipping

When integrating a third-party API (LLM provider, OAuth endpoint, webhook,
etc.), verify these against the provider's **current** documentation, never
against memory/training data:

- **Model IDs** — providers deprecate/remove models (e.g. `gpt-4-turbo`,
  `gpt-3.5-turbo` returned 404). Check the provider's model list page.
- **Endpoint URLs** — paths change between versions. Confirm the exact path.
- **Console/dashboard URLs** — where the user gets their API key. Confirm by
  opening the link; a wrong "how to get a key" URL wastes a user round-trip.
- **Constraints/limits** — rate limits, content-safety filters (GLM's is
  aggressive on Chinese page text), payload size caps, required permissions.
  Research these in the design phase, not after a runtime error.

If you cannot verify a fact (no access, paywalled docs), mark it with a
`// VERIFY: <what to check>` comment and tell the user explicitly.

## Checklist before finishing a feature change

- [ ] Design confirmed with user BEFORE implementing (non-trivial features)
- [ ] Module doc updated (new section or edited section) + `modules/README.md`
      index row
- [ ] [`../reference/`](../reference/) tables updated if keys/messages/modules
      changed
- [ ] [`../architecture/context.md`](../architecture/context.md) /
      [`../setup/setup.md`](../setup/setup.md) updated if architecture or build
      changed
- [ ] Code follows [`coding.md`](./coding.md)
- [ ] `manifest.json` version untouched (bump only via `build.js`)
- [ ] **Build ≠ verified** — `node build.js` only bundles; it does NOT
      type-check (esbuild strips types without catching undefined refs). After
      building, either run `npx tsc --noEmit` in `html/iframePage/` OR manually
      load the extension and exercise the changed flow. A green build does NOT
      mean the feature works.
- [ ] **No Chinese in code** — grep the changed files for non-ASCII chars in
      strings/comments/logs. [`coding.md`](./coding.md) already forbids it;
      this is the enforcement check. (Style files `.css` are exempt.)
- [ ] **External API facts verified** — model IDs, endpoints, dashboard URLs,
      and provider constraints checked against current docs (see section above).

## Failure mode

If you (an agent) realize mid-task that an earlier feature was never
documented, add it to the appropriate module file in `.agent/modules/` as part
of your change. Backfilling is always welcome — the catalog should converge
toward completeness over time.
