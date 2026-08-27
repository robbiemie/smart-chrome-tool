import type { Quote, StockSymbol } from '../types/stock';
import { fetchQuotes as fetchTencentQuotes, fetchQuote as fetchTencentQuote } from './tencent';
import { fetchEastMoneyQuotes } from './eastmoney';

/**
 * Unified quote dispatcher — routes each symbol to its best provider.
 *
 * HK → EastMoney (东方财富) → Tencent (兜底)
 * US → Tencent (then Yahoo extended-hours enrichment inside tencent.ts)
 *
 * Routing is centralized here so callers (poller, query command, add-to-
 * watchlist, show-detail) all get the same provider chain.
 */
export async function fetchQuotes(symbols: StockSymbol[]): Promise<Quote[]> {
  if (symbols.length === 0) {
    return [];
  }

  const hk = symbols.filter((s) => s.market === 'hk');
  const us = symbols.filter((s) => s.market === 'us');
  const [hkQuotes, usQuotes] = await Promise.all([
    hk.length > 0 ? fetchHkQuotes(hk) : Promise.resolve([]),
    us.length > 0 ? fetchTencentQuotes(us) : Promise.resolve([]),
  ]);
  return [...hkQuotes, ...usQuotes];
}

/**
 * HK fallback chain: EastMoney first, Tencent as last resort.
 * Returns whichever provider produces results; if both fail, returns [].
 */
async function fetchHkQuotes(hk: StockSymbol[]): Promise<Quote[]> {
  const primary = await fetchEastMoneyQuotes(hk);
  if (primary.length > 0) {
    return primary;
  }
  console.warn('[stocksTicker] HK eastmoney empty, falling back to tencent');
  return fetchTencentQuotes(hk);
}

/** Fetch a single quote, routed by market with the same chain. */
export async function fetchQuote(symbol: StockSymbol): Promise<Quote | null> {
  if (symbol.market === 'hk') {
    const [q] = await fetchHkQuotes([symbol]);
    return q ?? null;
  }
  return fetchTencentQuote(symbol);
}
