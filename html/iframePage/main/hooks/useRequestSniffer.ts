import { useEffect, useRef, useState } from 'react';

export interface CapturedRequest {
  id: number;
  source: 'xhr' | 'fetch';
  method: string;
  url: string;
  status: number;
  responseText: string;
  capturedAt: number;
}

const MAX_CAPTURED = 100;

// Static-resource extensions to ignore so the sniffer only shows XHR/API
// traffic. Matched against the pathname's final extension.
const STATIC_EXT_REGEX = /\.(js|css|mjs|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|otf|mp4|webm|mp3|wav|pdf|zip|tar|gz|wasm)(\?|$)/i;

const isStaticResource = (url: string): boolean => {
  if (!url) return false;
  try {
    const path = url.split('?')[0];
    return STATIC_EXT_REGEX.test(path);
  } catch {
    return false;
  }
};

export const useRequestSniffer = () => {
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  // Auto-incrementing id so React keys stay stable even after the ring
  // buffer wraps. Kept in a ref to avoid stale closures in the listener.
  const nextIdRef = useRef(1);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'AJAX_TOOLS_REQUEST_CAPTURED') return;

      const payload = data.payload;
      if (!payload || !payload.url) return;

      // Filter out static assets — the sniffer is for XHR/API traffic only.
      if (isStaticResource(payload.url)) return;

      const captured: CapturedRequest = {
        id: nextIdRef.current++,
        source: payload.source,
        method: (payload.method || '').toUpperCase(),
        url: payload.url,
        status: typeof payload.status === 'number' ? payload.status : 0,
        responseText: typeof payload.responseText === 'string' ? payload.responseText : '',
        capturedAt: Date.now(),
      };

      // Ring buffer: prepend newest, cap at MAX_CAPTURED so memory stays
      // bounded during long sessions.
      setRequests((prev) => [captured, ...prev].slice(0, MAX_CAPTURED));
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const clearRequests = () => setRequests([]);

  return {
    requests,
    clearRequests,
  };
};
