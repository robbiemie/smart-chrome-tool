import { useCallback, useEffect, useState } from 'react';

const FLOATING_ENABLED_KEY = 'ajaxToolsFloatingRulesEnabled';

// Drives the floating rules overlay (rendered by content.js on the host page).
// The toggle persists to chrome.storage so the content script picks it up
// via its storage.onChanged listener — no message passing required.
export const useFloatingRules = () => {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!chrome.storage?.local) return;

    chrome.storage.local.get([FLOATING_ENABLED_KEY], (result) => {
      setEnabled(result[FLOATING_ENABLED_KEY] !== false);
      setReady(true);
    });

    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[FLOATING_ENABLED_KEY]) {
        setEnabled(changes[FLOATING_ENABLED_KEY].newValue !== false);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const toggle = useCallback((next: boolean) => {
    setEnabled(next);
    if (chrome.storage?.local) {
      chrome.storage.local.set({ [FLOATING_ENABLED_KEY]: next });
    }
  }, []);

  return {
    floatingRulesEnabled: enabled,
    floatingRulesReady: ready,
    setFloatingRulesEnabled: toggle,
  };
};
