// Shared logger for the iframe workbench.
//
// Production releases of MockKit ship with all dev logs silenced so the
// extension never pollutes the host page console. Beta / dev builds (whose
// manifest name contains "Beta") enable full logging so contributors can
// trace update flows, editor reads, and message traffic during development.
//
// Detection is runtime, not build-time: the manifest name is rewritten to
// "MockKit Beta vX" by build-dev.js (or manually during the panel dev loop),
// so the same compiled dist/ works for both profiles — only the manifest
// differs. The iframe runs in the extension origin, so chrome.runtime is
// always available here.

// Cache the flag once: manifest reads are cheap but there is no reason to
// re-fetch on every log call.
const isDevMode = (() => {
  try {
    const name = chrome.runtime.getManifest().name || '';
    return /beta/i.test(name);
  } catch {
    // Fallback: if chrome.runtime is somehow unavailable, default to silent
    // (production-safe) so we never accidentally leak logs.
    return false;
  }
})();

export const logger = {
  log: (...args: any[]) => {
    if (isDevMode) console.log(...args);
  },
  info: (...args: any[]) => {
    if (isDevMode) console.info(...args);
  },
  warn: (...args: any[]) => {
    if (isDevMode) console.warn(...args);
  },
  // Error is ALWAYS logged regardless of dev mode — errors should never be
  // silently swallowed in production.
  error: (...args: any[]) => {
    console.error(...args);
  },
};
