# Feature Catalog — smart-chrome-tool (MockKit)

> **This is a living index.** Every agent that adds or changes a core feature
> MUST update the relevant module file in this folder in the same change — see
> [`../standards/governance.md`](../standards/governance.md).
>
> Each module lives in its own file. Format per entry: name, one-line summary,
> where it lives, how it's wired. Keep entries concise; link to source files
> with `path:line`.

> **Master-switch model:** the Interceptor (`ajaxToolsSwitchOn`) is the single
> master switch. Turning it OFF force-disables every mock sub-feature — Sniffer,
> Floating Rules, Page Headers (DNR) — and they do NOT auto-resume when it is
> turned back on; each must be re-enabled manually.

## Module index

| Module | Features | Summary |
| --- | --- | --- |
| [`interception.md`](./interception.md) | §1 Response interception & rewriting · §2 Request rewriting · §3 Payload script injection · §15 Response delay | Core mock layer: override/rewrite XHR & fetch |
| [`page-headers.md`](./page-headers.md) | §4 Per-page request header rules | DNR header rules per origin |
| [`render-mode.md`](./render-mode.md) | §5 CSR mode toggle | Toggle `__csr=1` |
| [`access-control.md`](./access-control.md) | §6 Domain whitelist | Gate mock layer by host |
| [`floating-panel.md`](./floating-panel.md) | §7 Floating rules panel | On-page rule toggles + auto-whitelist |
| [`dom-inspector.md`](./dom-inspector.md) | §8 DOM Inspector (inspect / measure / mark / hide) | DevTools-style element inspector |
| [`request-sniffer.md`](./request-sniffer.md) | §9 Request Sniffer | Live XHR/fetch capture + mock promotion |
| [`data-management.md`](./data-management.md) | §10 Import / Export | JSON backup & restore |
| [`self-update.md`](./self-update.md) | §11 Self-update | GitHub Releases update flow |
| [`panel-chrome.md`](./panel-chrome.md) | §12 Workbench panel chrome | zoom / fullscreen / PiP / theme |
| [`toolkit-animation.md`](./toolkit-animation.md) | §13 Toolkit Panel & Animation · §14 Tooltip suppression | Floating debug hub + animation freeze |
| [`workbench-ui.md`](./workbench-ui.md) | §16 Workbench Tools tab | Tab registry + tools consolidation |
| [`devtools-panel.md`](./devtools-panel.md) | §18 DevTools panel entry | Dual-entry workbench |
| [`feedback.md`](./feedback.md) | §17 Intercept-success toast | Top-right intercept confirmation |

## Adding a new feature

1. Decide which existing module file the feature belongs to. If none fits,
   create a new `modules/<name>.md` (one cohesive capability per file).
2. Append a section to that module file using the standard format (Summary /
   Lives in / Wiring). Reference source with `path:line`.
3. Add (or update) a row in the index table above.
4. If the feature adds a storage key / message type / runtime module, also
   update the relevant [`../reference/`](../reference/) table — see
   [`../standards/governance.md`](../standards/governance.md).
