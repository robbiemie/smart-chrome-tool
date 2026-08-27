import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';

/**
 * Proxy-aware HTTPS fetch util shared by providers (yahoo, ...).
 *
 * The global `fetch` in VSCode's extension host does NOT honor
 * `https_proxy` / `NODE_USE_ENV_PROXY` reliably (VSCode launched from the Dock
 * doesn't even inherit shell env vars), so we tunnel explicitly via HTTP
 * CONNECT using the proxy URL from the environment. The caller (extension.ts)
 * mirrors VSCode's `http.proxy` setting into env at activation.
 *
 * Only HTTP CONNECT proxies are supported (the common `http://host:port` form).
 * SOCKS proxies (`socks5://...`) are not handled — point `https_proxy` at the
 * HTTP proxy port instead (e.g. Clash/Surge's mixed/http port).
 */

/** Resolve an HTTP(S) proxy URL from the environment (set by extension.ts). */
export function getProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy || undefined
  );
}

/** Whether `hostname` should bypass the proxy per NO_PROXY. Simple suffix match. */
export function isNoProxy(hostname: string): boolean {
  const noProxy = (process.env.NO_PROXY || process.env.no_proxy || '').toLowerCase();
  if (!noProxy) {
    return false;
  }
  const host = hostname.toLowerCase();
  return noProxy.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((entry) => {
      if (entry === '*') {
        return true;
      }
      const e = entry.startsWith('.') ? entry.slice(1) : entry;
      return host === e || host.endsWith('.' + e);
    });
}

/**
 * Fetch text from an HTTPS URL, routing through an HTTP CONNECT proxy when
 * `https_proxy`/`http_proxy` is set (and not bypassed via NO_PROXY).
 *
 * Steps when a proxy is configured:
 *   1. TCP-connect to the proxy and issue `CONNECT host:443`.
 *   2. Upgrade the tunneled socket to TLS.
 *   3. Run the HTTPS GET over that TLS socket via `createConnection`.
 *
 * `extraHeaders` is merged on top of the default { User-Agent, Host } headers
 * so callers can attach Authorization etc.
 */
export function fetchText(
  urlStr: string,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const target = new URL(urlStr);
  const proxyUrlStr = getProxyUrl();
  const useProxy = !!proxyUrlStr && !isNoProxy(target.hostname);
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
    Host: target.hostname,
    ...(extraHeaders || {}),
  };

  return new Promise<string>((resolve, reject) => {
    const ok = (text: string): void => resolve(text);
    const fail = (err: Error): void => reject(err);

    const handleResponse = (httpRes: http.IncomingMessage): void => {
      if (httpRes.statusCode && (httpRes.statusCode < 200 || httpRes.statusCode >= 300)) {
        httpRes.resume();
        fail(new Error(`HTTP ${httpRes.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      httpRes.on('data', (c) => chunks.push(c));
      httpRes.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
      httpRes.on('error', fail);
    };

    if (useProxy) {
      const proxy = new URL(proxyUrlStr as string);
      const connectReq = http.request({
        host: proxy.hostname,
        port: Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80),
        method: 'CONNECT',
        path: `${target.hostname}:443`,
        headers: { Host: `${target.hostname}:443` },
      });
      connectReq.once('error', fail);
      connectReq.once('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          fail(new Error(`proxy CONNECT ${res.statusCode}`));
          return;
        }
        const tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
          const getReq = https.request(
            {
              createConnection: () => tlsSocket,
              hostname: target.hostname,
              path: target.pathname + target.search,
              method: 'GET',
              headers,
            },
            handleResponse
          );
          getReq.once('error', fail);
          getReq.end();
        });
        tlsSocket.once('error', fail);
      });
      connectReq.end();
    } else {
      const req = https.request(
        {
          hostname: target.hostname,
          port: 443,
          path: target.pathname + target.search,
          method: 'GET',
          agent: new https.Agent({ keepAlive: false }),
          headers,
        },
        handleResponse
      );
      req.once('error', fail);
      req.end();
    }
  });
}

/** JSON variant of {@link fetchText}. */
export async function fetchJson<T = any>(
  urlStr: string,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const text = await fetchText(urlStr, extraHeaders);
  return JSON.parse(text) as T;
}
