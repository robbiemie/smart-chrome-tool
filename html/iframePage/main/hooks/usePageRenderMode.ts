import { useCallback, useEffect, useState } from 'react';
import { notification } from 'antd';

interface PageRenderModeResponse {
  ok: boolean;
  csrEnabled?: boolean;
  currentUrl?: string;
  message?: string;
}

const sendRenderModeMessage = (payload: Record<string, any>) => new Promise<PageRenderModeResponse>((resolve, reject) => {
  if (!chrome.runtime?.sendMessage) {
    reject(new Error('Runtime messaging is unavailable.'));
    return;
  }

  chrome.runtime.sendMessage(payload, (response) => {
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message));
      return;
    }

    resolve((response || { ok: false }) as PageRenderModeResponse);
  });
});

export const usePageRenderMode = () => {
  const [csrEnabled, setCsrEnabled] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await sendRenderModeMessage({ type: 'GET_PAGE_RENDER_MODE' });
      if (!response?.ok) {
        throw new Error(response?.message || 'Failed to get current page mode.');
      }

      setCsrEnabled(Boolean(response.csrEnabled));
      setCurrentUrl(response.currentUrl || '');
    } catch (error: any) {
      notification.error({
        message: 'Render mode unavailable',
        description: error?.message || 'Unable to inspect the current page URL.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(async (nextCsrEnabled: boolean) => {
    setToggling(true);
    try {
      const response = await sendRenderModeMessage({
        type: 'SET_PAGE_RENDER_MODE',
        csrEnabled: nextCsrEnabled,
      });

      if (!response?.ok) {
        throw new Error(response?.message || 'Failed to update the current page URL.');
      }

      setCsrEnabled(nextCsrEnabled);
      setCurrentUrl(response.currentUrl || '');
      return true;
    } catch (error: any) {
      notification.error({
        message: 'Render mode update failed',
        description: error?.message || 'Unable to update the current page URL.',
      });
      return false;
    } finally {
      setToggling(false);
    }
  }, []);

  return {
    csrEnabled,
    currentUrl,
    loading,
    toggling,
    toggle,
    reload: load,
  };
};
