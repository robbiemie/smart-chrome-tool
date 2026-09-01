import * as vscode from 'vscode';
import type { PriceAlert } from '../types/alert';
import type { Quote } from '../types/stock';
import type { AlertStore } from '../storage/alertStore';

interface AlertEngineCallbacks {
  /** Called after alert state changed (fire / disarm / re-arm) so the UI can refresh. */
  onChanged?: () => void;
}

/**
 * Evaluates price alerts against incoming quotes and fires toasts.
 *
 * Driven by the Poller's onQuotes callback — no timer of its own.
 *
 * Trigger semantics:
 *   - `up`   : price >= targetPrice
 *   - `down` : price <= targetPrice
 *
 * Edge-triggered: fires only on the false→true transition (tracked via the
 * `armed` flag), then disarms until the condition goes false again. Prevents
 * a toast on every poll tick while the price stays beyond the threshold;
 * re-arms on retreat so each subsequent crossing fires again.
 */
export class AlertEngine {
  private running = false;

  constructor(
    private readonly store: AlertStore,
    private readonly callbacks: AlertEngineCallbacks = {}
  ) {}

  /** Evaluate all enabled alerts against the latest quotes. Called per poll tick. */
  async evaluate(quotes: Quote[]): Promise<void> {
    // Guard against re-entry: a slow storage write could overlap with the next tick.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const alerts = await this.store.getAll();
      if (alerts.length === 0) {
        return;
      }
      let dirty = false;
      for (const alert of alerts) {
        if (!alert.enabled) {
          continue;
        }
        const quote = quotes.find((q) => q.symbol.raw === alert.symbol.raw);
        if (!quote) {
          continue;
        }
        const triggered =
          alert.direction === 'up'
            ? quote.price >= alert.targetPrice
            : quote.price <= alert.targetPrice;

        if (triggered) {
          if (alert.armed) {
            // Edge-triggered: fire only on the armed→triggered transition,
            // then disarm until the condition goes false again (re-armed below).
            this.fire(alert, quote);
            alert.armed = false;
            alert.fireCount += 1;
            alert.lastFiredAt = Date.now();
            dirty = true;
          }
        } else if (!alert.armed) {
          // Condition no longer holds: re-arm so the next crossing fires again.
          alert.armed = true;
          dirty = true;
        }
      }
      if (dirty) {
        await this.store.saveAll(alerts);
        this.callbacks.onChanged?.();
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Show the alert as a status-bar message that auto-dismisses after 10s.
   *
   * VSCode's native toast (showWarningMessage) cannot be dismissed
   * programmatically — it lingers until the user clicks it. To honor the
   * "auto-close after 10s" requirement we use setStatusBarMessage with a
   * timeout instead. Trade-off: the「查看」follow action is dropped (status-
   * bar messages don't support action buttons), but the message still carries
   * the full symbol / target / live price, and the colored emoji badge keeps
   * the A-share up/down convention (🔴 ▲ red = up, 🟢 ▼ green = down).
   */
  private fire(alert: PriceAlert, quote: Quote): void {
    const isUp = alert.direction === 'up';
    // Colored badge + arrow: the only reliable cross-platform way to colorize
    // a VSCode message, since status-bar text cannot be tinted via API.
    const badge = isUp ? '🔴 ▲' : '🟢 ▼';
    const verb = isUp ? '涨到' : '跌到';
    const message =
      `${badge} ${quote.name} (${quote.symbol.code}) 已${verb} ${alert.targetPrice}，` +
      `现价 ${quote.price}`;
    // Auto-dismiss after 10 seconds. The returned Disposable is intentionally
    // not held — VSCode tears the message down itself when the timeout elapses.
    void vscode.window.setStatusBarMessage(message, 10000);
  }
}
