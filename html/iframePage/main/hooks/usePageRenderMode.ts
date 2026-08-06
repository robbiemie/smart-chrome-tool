import { useCallback, useEffect, useState } from 'react';

// CSR/SSR render-mode toggle for the React workbench. Mirrors the
// content.js floating-rules CSR button, but driven from the workbench Tools
// tab. All heavy lifting lives in the service worker:
//   GET_PAGE_RENDER_MODE -> reads `__csr=1` from the active tab URL
//   SET_PAGE_RENDER_MODE -> chrome.tabs.update() rewrites the URL (reloads tab)
// The hook only owns optimistic UI state; the SW reloads the page on toggle so
// the workbench is destroyed and re-mounted on the next load by design.
export const usePageRenderMode = () => {
  const [csrEnabled, setCsrEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Hydrate the current render mode from the SW once on mount. The SW reads
  // the active tab URL, so this reflects the real page state, not a stale copy.
  useEffect(() => {
    if (!chrome.runtime?.sendMessage) {
      setLoading(false);
      return;
    }
    chrome.runtime.sendMessage({ type: 'GET_PAGE_RENDER_MODE' }, (response) => {
      if (response?.ok) {
        setCsrEnabled(Boolean(response.csrEnabled));
      }
      setLoading(false);
    });
  }, []);

  // Flip the render mode. We re-read the current state from the SW first (the
  // page URL is the source of truth) so two rapid toggles never cancel out via
  // a stale local flag. SET_PAGE_RENDER_MODE reloads the tab, so the optimistic
  // setCsrEnabled below is only seen until the reload tears the iframe down.
  const toggle = useCallback(() => {
    if (!chrome.runtime?.sendMessage || toggling) return;
    setToggling(true);
    chrome.runtime.sendMessage({ type: 'GET_PAGE_RENDER_MODE' }, (getResponse) => {
      if (!getResponse?.ok) {
        setToggling(false);
        return;
      }
      const nextCsr = !getResponse.csrEnabled;
      chrome.runtime.sendMessage({ type: 'SET_PAGE_RENDER_MODE', csrEnabled: nextCsr }, (setResponse) => {
        if (setResponse?.ok) {
          setCsrEnabled(nextCsr);
        }
        setToggling(false);
      });
    });
  }, [toggling]);

  return {
    csrEnabled,
    loading,
    toggling,
    toggle,
  };
};
