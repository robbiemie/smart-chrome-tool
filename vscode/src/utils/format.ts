import type { Quote } from '../types/stock';
import type { Market } from '../types/stock';

/**
 * Baseline price used to compute change (pct / abs / up-down).
 *
 * Extended hours (pre/post market): the live `price` is an extended-hours
 * trade from Yahoo. The delta must be measured against the most recent
 * REGULAR session's close (`regularPrice` = Yahoo `regularMarketPrice`).
 *
 * Why NOT `regularPreviousClose` (Yahoo `previousClose`): during pre-market
 * that field lags — it still holds the CLOSE BEFORE the last regular session
 * (e.g. on Monday pre-market it shows Thursday's close, not Friday's), which
 * yields a wrong change % (off-by-one session). `regularMarketPrice` is the
 * authoritative last regular close.
 *
 * Why NOT Tencent `prevClose` during post-market: it still points to
 * yesterday's close after the regular session ends.
 *
 * Regular session: use Tencent's `prevClose` (today's previous close).
 */
export function changeBaseline(q: Quote): number {
  if (q.isExtended && q.regularPrice != null && q.regularPrice > 0) {
    return q.regularPrice;
  }
  return q.prevClose;
}

/** Percent change vs prev close, e.g. "+1.23%". */
export function formatChangePct(q: Quote): string {
  const baseline = changeBaseline(q);
  if (!baseline) {
    return '0.00%';
  }
  const pct = ((q.price - baseline) / baseline) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/** Absolute change, e.g. "+2.34". */
export function formatChangeAbs(q: Quote): string {
  const baseline = changeBaseline(q);
  const diff = q.price - baseline;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)}`;
}

export function isUp(q: Quote): boolean {
  return q.price >= changeBaseline(q);
}

export function formatPrice(q: Quote): string {
  return formatPriceByMarket(q.price, q.symbol.market);
}

/**
 * Format a raw price with market-appropriate precision.
 * US stocks use 2 decimals, HK uses 3 — single source of truth so target
 * prices and live prices render with identical precision.
 */
export function formatPriceByMarket(price: number, market: Market): string {
  return price.toFixed(market === 'us' ? 2 : 3);
}

export function formatMarketTag(market: Market): string {
  return market === 'hk' ? 'HK' : 'US';
}

/**
 * Display name for a stock: HK uses the Chinese name (truncated), US uses the
 * ticker code only (English company names are long and noisy in the UI).
 */
export function formatDisplayName(market: Market, name: string, code: string): string {
  if (market === 'us') {
    return code;
  }
  return formatName(name);
}

/**
 * Truncate a stock name to fit a max display width.
 * CJK characters count as 2 width units; ASCII as 1. Cap at 8 units (= 4 CJK
 * chars), appending an ellipsis when truncated. Used in status bar / tree /
 * quick-pick labels where horizontal space is tight.
 */
export function formatName(name: string, maxUnits = 8): string {
  let width = 0;
  let i = 0;
  for (; i < name.length; i++) {
    const code = name.charCodeAt(i);
    // CJK Unified Ideographs + common CJK punctuation ranges.
    const isCjk =
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3000 && code <= 0x30ff) ||
      (code >= 0xff00 && code <= 0xffef);
    const w = isCjk ? 2 : 1;
    if (width + w > maxUnits) {
      break;
    }
    width += w;
  }
  return i < name.length ? `${name.slice(0, i)}…` : name;
}
