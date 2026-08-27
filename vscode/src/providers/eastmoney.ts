import * as https from 'https';
import type { Quote, StockSymbol } from '../types/stock';

/**
 * East Money (东方财富) real-time quote API for HK stocks.
 *
 * Batch endpoint: https://push2.eastmoney.com/api/qt/ulist.np/get
 *   ?secids=116.<code1>,116.<code2>&fields=<csv>&fltt=2
 *
 *   - secid prefix 116 = Hong Kong market
 *   - fltt=2 returns numeric values as-is (no scaling)
 *   - Response is UTF-8 JSON (no GBK decoding needed, unlike Tencent/Sina)
 *   - One request fetches ALL HK symbols → far fewer requests than per-symbol
 *     polling, which avoids rate-limiting that caused empty/dropped quotes.
 *
 * Field map (verified from raw HK response for 03690 美团-W):
 *   f43 = current price, f44 = day high, f45 = day low, f46 = open,
 *   f47 = volume, f57 = code, f58 = name, f60 = prev close, f170 = change pct
 *
 * Chosen over Tencent for HK because Tencent's HK quotes are ~15min delayed
 * during the session, while EastMoney returns near-real-time prices. Also
 * EastMoney is mainland-reachable and returns UTF-8, so no proxy bypass or
 * GBK decoding is needed.
 */
const BATCH_ENDPOINT = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
/** Single-symbol fallback endpoint (same fields, one secid at a time). */
const SINGLE_ENDPOINT = 'https://push2.eastmoney.com/api/qt/stock/get';

/** EastMoney field codes to request. */
const FIELDS = 'f43,f44,f45,f46,f47,f57,f58,f60,f170';

interface EastMoneyData {
  /** Current price */
  f43?: number;
  /** Day high */
  f44?: number;
  /** Day low */
  f45?: number;
  /** Open */
  f46?: number;
  /** Volume */
  f47?: number;
  /** Code */
  f57?: string;
  /** Name (UTF-8, e.g. "美团-W") */
  f58?: string;
  /** Previous close */
  f60?: number;
  /** Change percent */
  f170?: number;
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    // Direct agent (bypasses system proxy) — EastMoney is mainland-reachable,
    // same rationale as the Tencent provider.
    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        agent: new https.Agent({ keepAlive: false }),
        headers: { 'User-Agent': 'Mozilla/5.0', Host: urlObj.hostname },
      },
      (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.once('error', reject);
    req.end();
  });
}

/** Build a Quote from one EastMoney data record. */
function buildQuote(symbol: StockSymbol, d: EastMoneyData): Quote | null {
  const price = Number(d.f43);
  const prevClose = Number(d.f60);
  // During market closures EastMoney may return price=0; fall back to prevClose
  // so the UI shows the last known price instead of "no data".
  const effectivePrice = price > 0 ? price : prevClose > 0 ? prevClose : 0;
  if (effectivePrice === 0) {
    return null;
  }
  const high = Number(d.f44);
  const low = Number(d.f45);
  const open = Number(d.f46);
  const volume = Number(d.f47);
  const name = d.f58 || symbol.code;
  return {
    symbol,
    name,
    price: effectivePrice,
    prevClose: prevClose || effectivePrice,
    open: Number.isFinite(open) ? open : 0,
    high: high > 0 ? high : undefined,
    low: low > 0 ? low : undefined,
    volume: Number.isFinite(volume) ? volume : 0,
  };
}

/** Fetch a single HK quote from EastMoney (fallback). Returns null on any error. */
async function fetchOne(symbol: StockSymbol): Promise<Quote | null> {
  const secid = `116.${symbol.code}`;
  const url = `${SINGLE_ENDPOINT}?secid=${encodeURIComponent(secid)}&fields=${FIELDS}&fltt=2`;
  let data: any;
  try {
    data = await fetchJson(url);
  } catch (err) {
    console.warn('[stocksTicker] eastmoney single failed:', secid, err);
    return null;
  }
  const d: EastMoneyData | undefined = data?.data;
  if (!d) {
    console.warn('[stocksTicker] eastmoney single no data for', secid);
    return null;
  }
  return buildQuote(symbol, d);
}

/**
 * Fetch HK quotes for multiple symbols in ONE batch request.
 * Symbols must be HK market (e.g. hk03690). US symbols are ignored.
 *
 * Uses the ulist.np batch endpoint: a single HTTP request returns all HK
 * quotes, which keeps request volume low (1 per poll tick regardless of
 * watchlist size) and avoids the rate-limiting that per-symbol polling hit.
 * Falls back to per-symbol requests if the batch endpoint fails or returns
 * an unexpected shape, so the provider degrades gracefully.
 */
export async function fetchEastMoneyQuotes(symbols: StockSymbol[]): Promise<Quote[]> {
  const hkSymbols = symbols.filter((s) => s.market === 'hk');
  if (hkSymbols.length === 0) {
    return [];
  }

  // --- Primary: batch endpoint (1 request for all HK symbols) ---
  const secids = hkSymbols.map((s) => `116.${s.code}`).join(',');
  const batchUrl = `${BATCH_ENDPOINT}?secids=${encodeURIComponent(secids)}&fields=${FIELDS}&fltt=2`;
  try {
    const data = await fetchJson(batchUrl);
    // Batch response shape: { data: { diff: [ {f43, f58, ...}, ... ] } }
    const records: EastMoneyData[] | undefined = data?.data?.diff;
    if (Array.isArray(records) && records.length > 0) {
      // Index records by code (f57) so we can match back to input symbols.
      const byCode = new Map<string, EastMoneyData>();
      for (const r of records) {
        const code = r.f57;
        if (code) {
          byCode.set(String(code), r);
        }
      }
      const out: Quote[] = [];
      for (const s of hkSymbols) {
        const d = byCode.get(s.code);
        if (!d) {
          continue;
        }
        const q = buildQuote(s, d);
        if (q) {
          out.push(q);
        }
      }
      if (out.length > 0) {
        console.log('[stocksTicker] eastmoney batch ok:', out.length, 'quotes from', hkSymbols.length, 'HK symbols');
        return out;
      }
      // Empty result could mean the batch shape changed — fall through to single.
      console.warn('[stocksTicker] eastmoney batch returned 0 usable quotes, falling back to single');
    } else {
      console.warn('[stocksTicker] eastmoney batch unexpected shape, falling back to single');
    }
  } catch (err) {
    console.warn('[stocksTicker] eastmoney batch failed, falling back to single:', secids, err);
  }

  // --- Fallback: per-symbol requests (parallel) ---
  const results = await Promise.allSettled(hkSymbols.map((s) => fetchOne(s)));
  const out: Quote[] = [];
  hkSymbols.forEach((s, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      out.push(r.value);
    }
  });
  console.log('[stocksTicker] eastmoney single fallback:', out.length, 'quotes from', hkSymbols.length, 'HK symbols');
  return out;
}
