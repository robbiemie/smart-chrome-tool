import type { StockSymbol } from './stock';

/** Trigger direction. `up` fires when price >= target; `down` when price <= target. */
export type AlertDirection = 'up' | 'down';

/** Fire mode. `once` auto-disables after firing; `recurring` is edge-triggered. */
export type AlertMode = 'once' | 'recurring';

export interface PriceAlert {
  /** Unique id (createdAt + random suffix). */
  id: string;
  symbol: StockSymbol;
  /** Cached display name, captured at creation time. */
  name: string;
  /** Target price that triggers the alert. */
  targetPrice: number;
  direction: AlertDirection;
  mode: AlertMode;
  enabled: boolean;
  createdAt: number;
  /** Timestamp of the last fire (for display). */
  lastFiredAt?: number;
  /** How many times this alert has fired. */
  fireCount: number;
  /**
   * Recurring-mode only: whether the alert is currently armed (ready to fire on
   * the next false→true transition). Edge-triggered logic:
   *   - fires only when `triggered && armed`, then disarms (`armed=false`)
   *   - re-arms when condition goes false again, so each threshold crossing fires once.
   * Once-mode alerts ignore this field (they fire unconditionally when triggered).
   */
  armed: boolean;
}
