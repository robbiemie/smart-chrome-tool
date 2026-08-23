import type { Quote } from '../types/stock';
import type { Market } from '../types/stock';

/** Percent change vs prev close, e.g. "+1.23%". */
export function formatChangePct(q: Quote): string {
  if (!q.prevClose) {
    return '0.00%';
  }
  const pct = ((q.price - q.prevClose) / q.prevClose) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/** Absolute change, e.g. "+2.34". */
export function formatChangeAbs(q: Quote): string {
  const diff = q.price - q.prevClose;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)}`;
}

export function isUp(q: Quote): boolean {
  return q.price >= q.prevClose;
}

export function formatPrice(q: Quote): string {
  return q.price.toFixed(q.symbol.market === 'us' ? 2 : 3);
}

export function formatMarketTag(market: Market): string {
  return market === 'hk' ? 'HK' : 'US';
}
