/// <reference types="vite/client" />

interface ImportMetaEnv {
  // True when built with MOCKKIT_STORE_BUILD=1 (Web Store submission build).
  // Injected by vite.config.js `define`. Used to strip the self-update entry.
  readonly STORE_BUILD?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
