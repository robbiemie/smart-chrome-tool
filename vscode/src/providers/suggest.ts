import * as https from 'https';
import type { StockSymbol } from '../types/stock';

/**
 * Tencent smartbox suggest API.
 * Endpoint: https://smartbox.gtimg.cn/s3/?q=<keyword>&t=all
 * Response: `v_hint="market~code~name~pinyin~type^market~code~name~pinyin~type^...";`
 *   - entries separated by `^`
 *   - fields separated by `~`: [0]=market(sh/sz/hk/us), [1]=code, [2]=name, [3]=pinyin, [4]=type(GP/...)
 *   - US code may carry exchange suffix (e.g. "aapl.oq", "tcehy.ps") which we strip.
 *
 * We only keep HK and US results (per plugin scope).
 */
const SUGGEST_HOST = 'smartbox.gtimg.cn';
const SUGGEST_PATH = '/s3/';

export interface SuggestItem {
  symbol: StockSymbol;
  name: string;
}

/**
 * Fetch text via https, bypassing system proxy.
 *
 * Node 22 with NODE_USE_ENV_PROXY=1 routes https through http_proxy/https_proxy
 * env vars, which may 403-block Tencent domains. We force a fresh agent and
 * connect directly to the resolved IP with SNI/Host headers, bypassing the proxy.
 */
function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const directAgent = new https.Agent({
      keepAlive: false,
      // Critical: this agent does not inherit the global proxy agent.
    });

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      agent: directAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://gu.qq.com/',
        Host: urlObj.hostname,
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Convert smartbox fields to a StockSymbol.
 * HK code is pure digits; US code may be "aapl.oq" → strip suffix → "AAPL".
 */
function toSymbol(rawCode: string, marketTag: string): StockSymbol | null {
  const tag = marketTag.toLowerCase();
  if (tag === 'hk') {
    // HK codes must be zero-padded to 5 digits for the Tencent quote API
    // (e.g. "700" → "00700" → "hk00700"). Smartbox sometimes returns
    // short codes without leading zeros.
    const code = rawCode.padStart(5, '0');
    return { raw: `hk${code}`, market: 'hk', code };
  }
  if (tag === 'us') {
    const base = rawCode.split('.')[0];
    const upper = base.toUpperCase();
    return { raw: `us${upper}`, market: 'us', code: upper };
  }
  return null;
}

function decodeUnicode(str: string): string {
  try {
    return str.replace(/\\u([\da-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return str;
  }
}

/**
 * Suggest HK/US stocks matching a keyword (code prefix or name pinyin).
 * Returns at most `limit` items. Empty array on network/parse error.
 */
export async function suggest(keyword: string, limit = 20): Promise<SuggestItem[]> {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return [];
  }
  const url = `https://${SUGGEST_HOST}${SUGGEST_PATH}?q=${encodeURIComponent(trimmed)}&t=all`;
  let text: string;
  try {
    text = await fetchText(url);
  } catch (err) {
    console.warn('[stocksTicker] suggest fetch failed:', err);
    return [];
  }
  console.log('[stocksTicker] suggest raw response (first 200 chars):', text.slice(0, 200));
  const match = text.match(/v_hint\s*=\s*"([^"]*)"/);
  if (!match || !match[1]) {
    console.warn('[stocksTicker] suggest: v_hint not found in response');
    return [];
  }
  const body = decodeUnicode(match[1]);
  const entries = body.split('^').filter(Boolean);
  const out: SuggestItem[] = [];
  for (const entry of entries) {
    const parts = entry.split('~');
    if (parts.length < 3) {
      continue;
    }
    const marketTag = parts[0] ?? '';
    const rawCode = parts[1] ?? '';
    const name = parts[2] ?? rawCode;
    const symbol = toSymbol(rawCode, marketTag);
    if (!symbol) {
      continue;
    }
    out.push({ symbol, name });
    if (out.length >= limit) {
      break;
    }
  }
  console.log('[stocksTicker] suggest parsed:', out.length, 'items for keyword:', trimmed);
  return out;
}
