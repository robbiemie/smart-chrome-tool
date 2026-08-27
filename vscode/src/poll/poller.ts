import { fetchQuotes } from '../providers';
import { isMarketOpen } from '../utils/marketHours';
import type { Market } from '../types/stock';
import type { WatchlistStore } from '../storage/watchlistStore';
import type { Quote } from '../types/stock';

interface PollerCallbacks {
  onQuotes: (quotes: Quote[]) => void;
  onError: (message: string) => void;
}

/**
 * Periodically fetches watchlist quotes and drives the status bar + tree.
 *
 * Polls HK and US markets INDEPENDENTLY — each has its own timer so a closed
 * market can poll slowly (e.g. 1h) while an open one polls fast (e.g. 8s).
 * After each tick, both markets' quotes are merged and delivered together so
 * the UI always shows the full picture.
 *
 * Uses recursive setTimeout (not setInterval) so the interval is recomputed
 * after every tick, adapting when a market transitions between open/closed.
 */
export class Poller {
  private timers: Partial<Record<Market, NodeJS.Timeout>> = {};
  private running: Partial<Record<Market, boolean>> = {};
  private stopped = false;
  private quotesByMarket: Partial<Record<Market, Quote[]>> = {};

  constructor(
    private readonly store: WatchlistStore,
    private readonly callbacks: PollerCallbacks,
    private readonly getConfig: () => Record<Market, { on: number; off: number }>
  ) {}

  start(): void {
    if (this.timers.hk || this.timers.us) {
      return;
    }
    this.stopped = false;
    void this.tick('hk');
    void this.tick('us');
  }

  stop(): void {
    this.stopped = true;
    (['hk', 'us'] as Market[]).forEach((m) => {
      const t = this.timers[m];
      if (t) {
        clearTimeout(t);
        delete this.timers[m];
      }
    });
  }

  /** Trigger an immediate refresh out-of-cycle (both markets, does not reset scheduled timers). */
  refreshNow(): void {
    void this.tick('hk');
    void this.tick('us');
  }

  private scheduleNext(market: Market): void {
    if (this.stopped) {
      return;
    }
    const { on, off } = this.getConfig()[market];
    const open = isMarketOpen(market);
    const interval = open ? on : off;
    console.log('[stocksTicker] schedule next', market, 'in', interval, 'ms (open=', open, ')');
    this.timers[market] = setTimeout(() => void this.tick(market), interval);
  }

  private async tick(market: Market): Promise<void> {
    if (this.running[market] || this.stopped) {
      return;
    }
    this.running[market] = true;
    const open = isMarketOpen(market);
    console.log('[stocksTicker] tick start', market, 'open=', open, 'at', new Date().toISOString());
    try {
      const list = await this.store.getAll();
      const marketItems = list.filter((it) => it.symbol.market === market);
      if (marketItems.length === 0) {
        this.quotesByMarket[market] = [];
      } else {
        const quotes = await fetchQuotes(marketItems.map((it) => it.symbol));
        // Only overwrite when we got fresh data. If the fetch returned empty
        // (rate-limited / transient network error), keep the previous quotes
        // so the UI does not flash to "no data" and back. A short-lived stale
        // price beats a flickering code↔name toggle.
        if (quotes.length > 0) {
          this.quotesByMarket[market] = quotes;
        }
        console.log('[stocksTicker] tick got', quotes.length, 'quotes for', market, 'from', marketItems.length, 'items');
      }
      // Merge both markets' quotes and deliver the full picture.
      const all: Quote[] = [
        ...(this.quotesByMarket.hk ?? []),
        ...(this.quotesByMarket.us ?? []),
      ];
      this.callbacks.onQuotes(all);
    } catch (err) {
      this.callbacks.onError(String(err));
    } finally {
      this.running[market] = false;
      this.scheduleNext(market);
    }
  }
}
