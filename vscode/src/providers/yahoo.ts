import type { StockSymbol } from '../types/stock';

/**
 * Yahoo Finance chart API — supplements Tencent for US pre/post-market prices.
 *
 * Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/<symbol>
 *   ?interval=2m&range=1d&includePrePost=true
 *
 * Response meta contains regularMarketPrice / previousClose / regularMarketTime,
 * plus preMarketPrice / postMarketPrice when extended-hours trading is active.
 *
 * Symbol mapping:
 *   - Tencent "usAAPL" → Yahoo "AAPL"
 *   - Tencent "hk00700" → Yahoo "0700.HK"
 *
 * NOTE: Yahoo is unreachable from mainland China without a VPN. Unlike the
 * Tencent provider (which MUST bypass the system proxy to avoid 403), Yahoo
 * MUST go THROUGH the proxy. We use the global `fetch` API, which respects
 * NODE_USE_ENV_PROXY / https_proxy env vars automatically. On failure we
 * silently return null; the caller falls back to Tencent-only data.
 */
const CHART_ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart';

export interface YahooQuote {
  regularPrice: number;
  previousClose: number;
  regularTime?: number;
  preMarketPrice?: number;
  postMarketPrice?: number;
  /** Latest price including extended hours (falls back to regular). */
  latestPrice: number;
  isExtended: 'pre' | 'post' | null;
}

function toYahooSymbol(symbol: StockSymbol): string {
  if (symbol.market === 'us') {
    return symbol.code;
  }
  // HK: strip leading zeros, append ".HK"
  return `${Number(symbol.code)}.HK`;
}

async function fetchJson(url: string): Promise<any> {
  // Use global fetch (Node 18+) — respects NODE_USE_ENV_PROXY / https_proxy,
  // routing Yahoo through the system VPN proxy. Tencent uses a custom agent
  // to bypass the proxy (its domains get 403'd by the proxy allowlist).
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch extended-hours quote for a single US/HK symbol.
 * Returns null on any error (caller should fall back to Tencent-only data).
 */
export async function fetchYahooQuote(symbol: StockSymbol): Promise<YahooQuote | null> {
  const ySymbol = toYahooSymbol(symbol);
  const url = `${CHART_ENDPOINT}/${encodeURIComponent(ySymbol)}?interval=2m&range=1d&includePrePost=true`;
  let data: any;
  try {
    data = await fetchJson(url);
  } catch (err) {
    console.warn('[stocksTicker] yahoo fetch failed:', ySymbol, err);
    return null;
  }
  const result = data?.chart?.result?.[0];
  if (!result) {
    console.warn('[stocksTicker] yahoo no result for', ySymbol);
    return null;
  }
  const meta = result.meta ?? {};
  const regularPrice = Number(meta.regularMarketPrice);
  const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose);
  if (!Number.isFinite(regularPrice) || regularPrice === 0) {
    return null;
  }
  const preMarketPrice = meta.preMarketPrice != null ? Number(meta.preMarketPrice) : undefined;
  const postMarketPrice = meta.postMarketPrice != null ? Number(meta.postMarketPrice) : undefined;
  const regularTime = meta.regularMarketTime;

  // Determine the latest price and extended session kind.
  // Prefer postMarket (more recent) over preMarket.
  let latestPrice: number = regularPrice;
  let isExtended: 'pre' | 'post' | null = null;
  if (postMarketPrice != null && Number.isFinite(postMarketPrice) && postMarketPrice !== regularPrice) {
    latestPrice = postMarketPrice;
    isExtended = 'post';
  } else if (preMarketPrice != null && Number.isFinite(preMarketPrice) && preMarketPrice !== regularPrice) {
    latestPrice = preMarketPrice;
    isExtended = 'pre';
  }

  console.log('[stocksTicker] yahoo ok:', ySymbol, 'regular=', regularPrice, 'pre=', preMarketPrice, 'post=', postMarketPrice, 'extended=', isExtended);

  return {
    regularPrice,
    previousClose,
    regularTime,
    preMarketPrice,
    postMarketPrice,
    latestPrice,
    isExtended,
  };
}

/**
 * Fetch Yahoo quotes for multiple symbols in parallel.
 * Returns a map keyed by Tencent raw symbol.
 */
export async function fetchYahooQuotes(symbols: StockSymbol[]): Promise<Map<string, YahooQuote>> {
  const out = new Map<string, YahooQuote>();
  if (symbols.length === 0) {
    return out;
  }
  const results = await Promise.allSettled(symbols.map((s) => fetchYahooQuote(s)));
  symbols.forEach((s, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      out.set(s.raw, r.value);
    }
  });
  return out;
}
