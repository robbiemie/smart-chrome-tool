# Coding Conventions — smart-chrome-tool (MockKit)

> Patterns the codebase already follows. Match existing style; do not introduce
> new conventions without reason.

## Languages & files

- **Extension runtime** (`service_worker.js`, `content.js`,
  `pageScripts/index.js`): plain ES2017+ JavaScript, no transpilation. Must run
  in the relevant Chrome context as-is.
- **Workbench** (`html/iframePage/`): TypeScript + React 18. New files default
  to `.ts`/`.tsx`.
- **No test files** — verification is manual (see `setup.md`).

## Naming

- **React components**: PascalCase, each in its own folder
  (`components/MyComponent/index.tsx`). Mirror existing structure.
- **Hooks**: `use*` semantic names in `hooks/`.
- **Functions/vars in JS runtime**: camelCase.
- **CSS classes**: BEM-ish with `mockkit-` / `ajax-tools-` prefixes (e.g.
  `mockkit-dom-inspector__core-row--label`). Follow the prefix already used by
  the surrounding code.
- **Storage keys**: `ajaxTools*` (legacy/interceptor) or `mockkit*` (newer).
  Reuse an existing prefix; do not invent a new one.

## Comments

- **Critical logic MUST be commented** (business branches, workarounds,
  non-obvious data transforms, side effects, error-handling decisions).
  Existing code does this consistently — match it.
- Comments in **English**. No Chinese in code (strings, comments, logs).
- Style files (`.css`) are exempt.

## React workbench patterns

- Wrap exported components with `withErrorBoundary`
  (`main/common/withErrorBoundary.tsx`) — see existing components.
- Extract reusable state/effect logic into `hooks/use*.ts`.
- Persist UI state via `chrome.storage.local`; sync across contexts via
  `chrome.storage.onChanged` (see `useRegistry.ts` for the canonical pattern).
- Cross-context calls from the iframe: `chrome.runtime.sendMessage` to the SW,
  `window.parent.postMessage` to `content.js`. Always guard with
  `if (!chrome.storage)` / `if (!chrome.runtime)` for standalone-browser safety.
- Do NOT use `unknown` types. If a type can't be narrowed, use `any` with a
  `// TODO: narrow type` note.

## Extension runtime patterns

- **No bundler**: keep files dependency-free (only `chrome.*` and DOM APIs).
- Service worker: assume it can be killed anytime — persist state to
  `chrome.storage.local`, never rely on module-level variables surviving.
- Content script ↔ page script: `window.postMessage` only; the page script has
  no `chrome.*` access.
- When adding a new storage key, add it to the table in
  `../project/tech-detail.md`.
- When adding a new message type, add it to the message table in
  `../project/tech-detail.md`.

## Versioning

- **`manifest.json` is the source of truth** for version. Never edit
  `package.json` version directly — `build.js` mirrors it.
- Bump via `node build.js --bump` or `--publish`, never by hand.

## Git / commits

- Commit message style observed in history: `feat: ...`, `fix: ...`,
  `chore: ...` (Conventional Commits). Match it.
- `build.js --commit` auto-commits as `chore: v<version>`.
- Don't commit zip files (they're gitignored) or `node_modules`.

## Dependencies

- Keep the extension zip small. Avoid heavy new deps in the workbench; prefer
  what's already installed (antd, monaco, react). Runtime JS must stay
  dependency-free.
