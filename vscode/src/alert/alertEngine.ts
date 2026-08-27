import * as vscode from 'vscode';
import type { PriceAlert } from '../types/alert';
import type { Quote } from '../types/stock';
import type { AlertStore } from '../storage/alertStore';

interface AlertEngineCallbacks {
  /** Called after alert state changed (fire / disarm / re-arm) so the UI can refresh. */
  onChanged?: () => void;
  /** Called when the user clicks「查看」on a fired toast; lets the caller peek the status bar. */
  onFollow?: (quote: Quote) => void;
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
 * Fire modes:
 *   - `once`     : fires the first time the condition holds, then auto-disables.
 *   - `recurring`: edge-triggered — fires only on the false→true transition
 *                  (tracked via the `armed` flag), re-arms when the condition
 *                  goes false again. Prevents a toast on every poll tick while
 *                  the price stays beyond the threshold.
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
          if (alert.mode === 'once') {
            // One-shot: fire immediately, then disable so it never fires again.
            this.fire(alert, quote);
            alert.enabled = false;
            alert.fireCount += 1;
            alert.lastFiredAt = Date.now();
            dirty = true;
          } else if (alert.armed) {
            // Recurring + edge-triggered: fire only on the armed→triggered transition,
            // then disarm until the condition goes false again (re-armed below).
            this.fire(alert, quote);
            alert.armed = false;
            alert.fireCount += 1;
            alert.lastFiredAt = Date.now();
            dirty = true;
          }
        } else if (alert.mode === 'recurring' && !alert.armed) {
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
   * Show the bottom-right toast for a fired alert.
   *
   * VSCode's native toast API (showWarningMessage) does NOT support custom
   * colors or icons — every message uses the same yellow "!" glyph. To
   * differentiate rise vs fall we prefix a colored emoji badge matching the
   * status bar's A-share convention (🔴 red = up, 🟢 green = down), the same
   * palette used in the add-alert direction picker for consistency.
   */
  private fire(alert: PriceAlert, quote: Quote): void {
    const isUp = alert.direction === 'up';
    // Colored badge + arrow: the only reliable cross-platform way to colorize
    // a VSCode toast, since QuickPick/toast text cannot be tinted via API.
    const badge = isUp ? '🔴 ▲' : '🟢 ▼';
    const verb = isUp ? '涨到' : '跌到';
    const message =
      `${badge} ${quote.name} (${quote.symbol.code}) 已${verb} ${alert.targetPrice}，` +
      `现价 ${quote.price}`;
    void vscode.window.showWarningMessage(message, '查看').then((action) => {
      if (action === '查看') {
        this.callbacks.onFollow?.(quote);
      }
    });
  }
}
