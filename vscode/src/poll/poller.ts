import { fetchQuotes } from '../providers/tencent';
import { currentSession } from '../utils/marketHours';
import type { WatchlistStore } from '../storage/watchlistStore';
import type { Quote } from '../types/stock';

interface PollerCallbacks {
  onQuotes: (quotes: Quote[]) => void;
  onError: (message: string) => void;
}

/**
 * Periodically fetches watchlist quotes and drives the status bar + tree.
 *
 * Uses recursive setTimeout instead of setInterval so:
 *  1. The interval is recomputed after every tick → adapts when market
 *     session transitions between open/closed (no need to restart).
 *  2. No tick overlap: the next timer is scheduled only after the current
 *     fetch finishes, preventing drift and request pile-up.
 */
export class Poller {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly store: WatchlistStore,
    private readonly callbacks: PollerCallbacks,
    private readonly getConfig: () => { on: number; off: number }
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.stopped = false;
    // First tick immediately.
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /** Trigger an immediate refresh out-of-cycle (does not reset the scheduled timer). */
  refreshNow(): void {
    void this.tick();
  }

  private scheduleNext(): void {
    if (this.stopped) {
      return;
    }
    const { on, off } = this.getConfig();
    const interval = currentSession().open ? on : off;
    this.timer = setTimeout(() => void this.tick(), interval);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    try {
      const list = await this.store.getAll();
      if (list.length === 0) {
        this.callbacks.onQuotes([]);
        return;
      }
      const quotes = await fetchQuotes(list.map((it) => it.symbol));
      this.callbacks.onQuotes(quotes);
    } catch (err) {
      this.callbacks.onError(String(err));
    } finally {
      this.running = false;
      this.scheduleNext();
    }
  }
}
