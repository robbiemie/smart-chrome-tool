# Governance — Documentation Sync Rule

> **Mandatory rule for every agent (human or AI) working on this repo.**
> This is the mechanism that keeps `.agent/project/features.md` alive without
> a separate "docs maintenance" step.

## The rule

**When you add, remove, or materially change a core feature, you MUST update
`.agent/project/features.md` in the same change set.**

"Core feature" = any user-facing capability that an agent would need to know
about to understand the project: a new interception mode, a new panel, a new
storage-backed setting, a new message flow, a new toolbar action, etc.

A pure refactor, bug fix, or style tweak that does not change behavior does
NOT require a doc update.

## Why

- `.agent/project/features.md` is the index every agent reads first to orient
  itself. If it drifts, every subsequent agent starts with a wrong model.
- There is no CI gate; the contract is social + enforced by this instruction.
  Treating it as part of the change (like a test) is what keeps it accurate.

## How to update `features.md`

1. Open `.agent/project/features.md`.
2. Append a new numbered section **above** the trailing
   `<!-- NEW FEATURES GO HERE -->` comment, or edit the existing section if
   changing a feature.
3. Use the existing entry format:
   ```markdown
   ## N. <Feature name>

   **Summary:** One or two sentences: what it does.

   **Lives in:**
   - `path/to/file.js` (`functionName`, ...)
   - `path/to/Component/` (what it renders)

   **Wiring:** Brief data/flow notes (storage key, message types, triggers).
   ```
4. Reference source with `path:line` where it aids navigation.

## Companion updates

If your feature introduces any of these, also update:

| You added... | Also update |
| --- | --- |
| A new `chrome.storage` key | `../project/tech-detail.md` → Storage keys table |
| A new cross-context message type | `../project/tech-detail.md` → Message types table |
| A new runtime file or major module | `../project/tech-detail.md` → Module map |
| A new permission in `manifest.json` | `../project/context.md` (note it) |
| A new build/publish flag | `../project/setup.md` → Build section |

## Checklist before finishing a feature change

- [ ] `features.md` updated (new section or edited section)
- [ ] `tech-detail.md` tables updated if keys/messages/modules changed
- [ ] `context.md` / `setup.md` updated if architecture or build changed
- [ ] Code follows `coding.md`
- [ ] `manifest.json` version untouched (bump only via `build.js`)

## Failure mode

If you (an agent) realize mid-task that an earlier feature was never
documented, add it to `features.md` as part of your change. Backfilling is
always welcome — the catalog should converge toward completeness over time.
