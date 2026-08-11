import { useCallback, useEffect, useState } from 'react';

const TOOLKIT_VISIBLE_KEY = 'ajaxToolsToolkitPanelVisible';

// Drives the Toolkit master panel (rendered by content.js on the host page).
// The toggle persists to chrome.storage so the content script picks it up via
// its storage.onChanged listener — the panel re-appears after a page reload if
// the user left it on. Mirrors the useFloatingRules pattern.
//
// First-load default: Toolkit is ON (key undefined → ON). Sub-features inside
// Toolkit (Floating Rules / Animation / Sniffer) default OFF and must be
// enabled manually. Once the user explicitly turns Toolkit OFF (persists
// false), it stays OFF on subsequent loads.
export const useToolkitPanel = () => {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!chrome.storage?.local) return;

    chrome.storage.local.get([TOOLKIT_VISIBLE_KEY], (result) => {
      // undefined (first load) → ON; false (user hid) → OFF.
      setEnabled(result[TOOLKIT_VISIBLE_KEY] !== false);
      setReady(true);
    });

    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[TOOLKIT_VISIBLE_KEY]) {
        setEnabled(changes[TOOLKIT_VISIBLE_KEY].newValue !== false);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const toggle = useCallback((next: boolean) => {
    setEnabled(next);
    if (chrome.storage?.local) {
      chrome.storage.local.set({ [TOOLKIT_VISIBLE_KEY]: next });
    }
  }, []);

  return {
    toolkitEnabled: enabled,
    toolkitReady: ready,
    setToolkitEnabled: toggle,
  };
};
