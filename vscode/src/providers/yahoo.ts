import type { StockSymbol } from '../types/stock';
import { fetchJson, getProxyUrl } from '../utils/proxyFetch';

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
 * NOTE: Yahoo is unreachable from mainland China without a proxy. Unlike the
 * Tencent provider (which MUST bypass the system proxy with a direct agent),
 * Yahoo MUST go THROUGH the proxy. The global `fetch` in VSCode's extension
 * host does NOT honor `https_proxy` / `NODE_USE_ENV_PROXY` reliably (VSCode
 * launched from the Dock doesn't even inherit shell env vars), so we tunnel
 * explicitly via HTTP CONNECT using the proxy URL from the environment. The
 * caller (extension.ts) also mirrors VSCode's `http.proxy` setting into env
 * at activation. On failure we return null; the caller falls back to
 * Tencent-only regular-session data (no extended-hours tag).
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

/**
 * Convert a Unix timestamp (seconds) to Eastern Time minutes-of-day,
 * approximating US DST (2nd Sunday of March → 1st Sunday of November).
 */
function timestampToEtMinutes(ts: number): number {
  const date = new Date(ts * 1000);
  const year = date.getUTCFullYear();
  const secondSunMar = 8 + ((7 - new Date(Date.UTC(year, 2, 1)).getUTCDay()) % 7);
  const firstSunNov = 1 + ((7 - new Date(Date.UTC(year, 10, 1)).getUTCDay()) % 7);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const inDST =
    (month > 3 && month < 11) ||
    (month === 3 && day >= secondSunMar) ||
    (month === 11 && day < firstSunNov);
  const offsetHours = inDST ? -4 : -5;
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes();
  return ((utcMin + offsetHours * 60) % (24 * 60) + 24 * 60) % (24 * 60);
}

/** Classify ET minutes-of-day into US trading session. */
function classifyEtSession(etMin: number): 'pre' | 'regular' | 'post' | 'closed' {
  if (etMin >= 4 * 60 && etMin < 9 * 60 + 30) return 'pre';
  if (etMin >= 9 * 60 + 30 && etMin < 16 * 60) return 'regular';
  if (etMin >= 16 * 60 && etMin < 20 * 60) return 'post';
  return 'closed';
}

interface ChartBar {
  price: number;
  session: 'pre' | 'regular' | 'post' | 'closed';
}

/**
 * Parse the chart's intraday bars (timestamp + close arrays) to extract
 * extended-hours information. Yahoo's meta.preMarketPrice / postMarketPrice
 * fields are only populated while that session is ACTIVELY trading; after it
 * closes they disappear. The chart bars, however, retain all sessions' data
 * when includePrePost=true, so we can reliably find the latest pre/post price
 * even after hours.
 *
 * Returns: latest bar, latest regular-session bar, latest pre bar, latest post bar.
 */
function parseChartBars(result: any): {
  latest?: ChartBar;
  regular?: ChartBar;
  pre?: ChartBar;
  post?: ChartBar;
} {
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  if (timestamps.length === 0 || closes.length === 0) {
    return {};
  }
  let latest: ChartBar | undefined;
  let regular: ChartBar | undefined;
  let pre: ChartBar | undefined;
  let post: ChartBar | undefined;
  // Walk backwards — most recent bars first.
  for (let i = timestamps.length - 1; i >= 0; i--) {
    const close = closes[i];
    if (close == null || !Number.isFinite(Number(close))) {
      continue;
    }
    const price = Number(close);
    const session = classifyEtSession(timestampToEtMinutes(timestamps[i]));
    const bar: ChartBar = { price, session };
    if (!latest) latest = bar;
    if (!regular && session === 'regular') regular = bar;
    if (!pre && session === 'pre') pre = bar;
    if (!post && session === 'post') post = bar;
    if (latest && regular && pre && post) break;
  }
  return { latest, regular, pre, post };
}

/**
 * Fetch extended-hours quote for a single US/HK symbol.
 * Returns null on any error (caller should fall back to Tencent-only data).
 */
export async function fetchYahooQuote(symbol: StockSymbol): Promise<YahooQuote | null> {
  const ySymbol = toYahooSymbol(symbol);
  const url = `${CHART_ENDPOINT}/${encodeURIComponent(ySymbol)}?interval=2m&range=1d&includePrePost=true`;
  const proxy = getProxyUrl();
  console.log('[stocksTicker] yahoo fetch start', ySymbol, 'proxy=', proxy ? proxy : 'off (direct — Yahoo unreachable in mainland CN without proxy)');
  let data: any;
  try {
    data = await fetchJson(url);
  } catch (err) {
    console.warn('[stocksTicker] yahoo fetch failed:', ySymbol, err, '(proxy:', getProxyUrl() ? 'on' : 'off', ')');
    return null;
  }
  const result = data?.chart?.result?.[0];
  if (!result) {
    console.warn('[stocksTicker] yahoo no result for', ySymbol);
    return null;
  }
  const meta = result.meta ?? {};
  const metaRegularPrice = Number(meta.regularMarketPrice);
  const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose);
  if (!Number.isFinite(metaRegularPrice) || metaRegularPrice === 0) {
    return null;
  }
  const regularTime = meta.regularMarketTime;

  // Primary source: parse chart bars for session-aware pricing.
  // Fallback: meta fields (only set during active extended sessions).
  const bars = parseChartBars(result);
  const regularPrice = bars.regular?.price ?? metaRegularPrice;
  const preMarketPrice = bars.pre?.price ?? (meta.preMarketPrice != null ? Number(meta.preMarketPrice) : undefined);
  const postMarketPrice = bars.post?.price ?? (meta.postMarketPrice != null ? Number(meta.postMarketPrice) : undefined);

  // The latest bar is the most recent trade — could be pre, regular, or post.
  // Determine isExtended from the latest bar's session.
  let latestPrice: number = metaRegularPrice;
  let isExtended: 'pre' | 'post' | null = null;
  if (bars.latest) {
    latestPrice = bars.latest.price;
    isExtended = bars.latest.session === 'pre' ? 'pre'
      : bars.latest.session === 'post' ? 'post' : null;
  } else {
    // No bars — fall back to meta fields.
    if (postMarketPrice != null && Number.isFinite(postMarketPrice)) {
      latestPrice = postMarketPrice;
      isExtended = 'post';
    } else if (preMarketPrice != null && Number.isFinite(preMarketPrice)) {
      latestPrice = preMarketPrice;
      isExtended = 'pre';
    }
  }

  console.log('[stocksTicker] yahoo ok:', ySymbol,
    'regular=', regularPrice,
    'previousClose=', previousClose,
    'pre=', preMarketPrice,
    'post=', postMarketPrice,
    'latest=', latestPrice,
    'extended=', isExtended,
    'bars:', bars.latest ? `${bars.latest.session}@${bars.latest.price}` : 'none');

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
