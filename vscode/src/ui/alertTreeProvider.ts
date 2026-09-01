import * as vscode from 'vscode';
import * as path from 'path';
import { formatChangePct, formatMarketTag, formatPrice, formatPriceByMarket, isUp } from '../utils/format';
import type { PriceAlert } from '../types/alert';
import type { Quote } from '../types/stock';

/** Resolve a media icon path to a vscode-ready URI. */
function mediaIcon(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', 'media', name));
}

/**
 * TreeDataProvider backing the sidebar「价格提醒」view.
 *
 * Display rules are kept in lockstep with AlertEngine state — every visual
 * signal (icon, status tag, ✓ marker) is derived from the same fields the
 * engine reads, so what the user sees always matches what the engine will do
 * on the next poll tick.
 *
 * ── Icon (reflects "is the alert still alive?") ─────────────────────────
 *   enabled                           → up.svg / down.svg by alert direction
 *                                        (stays colored even while a recurring
 *                                        alert waits for a retreat to re-arm;
 *                                        only disabled alerts go flat)
 *   !enabled                          → flat.svg (manually off or spent)
 *
 * ── ✓ marker (mirrors the engine's `triggered` formula) ──────────────────
 *   Shown after the live price when the condition currently holds:
 *     up   : price >= targetPrice
 *     down : price <= targetPrice
 *
 * ── Status tag (exhaustive over engine states) ───────────────────────────
 *   !enabled                          → 已停用   (manually disabled)
 *   enabled + !armed                  → 待回落   (fired, waiting to re-arm)
 *   enabled + armed                   → 监听中   (actively watching)
 *
 * contextValue taxonomy (drives menu visibility):
 *   - alertOn  : enabled alert (can toggle off / remove)
 *   - alertOff : disabled alert (can toggle on / remove)
 */
export class AlertTreeProvider implements vscode.TreeDataProvider<AlertNode> {
  private readonly _onDidChange = new vscode.EventEmitter<AlertNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private alerts: PriceAlert[] = [];
  private quotes = new Map<string, Quote>();

  setAlerts(list: PriceAlert[]): void {
    this.alerts = list;
    this._onDidChange.fire(undefined);
  }

  setQuotes(quotes: Quote[]): void {
    this.quotes.clear();
    for (const q of quotes) {
      this.quotes.set(q.symbol.raw, q);
    }
    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: AlertNode): vscode.TreeItem {
    return element;
  }

  getChildren(): AlertNode[] {
    if (this.alerts.length === 0) {
      return [];
    }
    // Newest first so freshly-added alerts surface to the top.
    return [...this.alerts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => this.buildNode(a));
  }

  private buildNode(alert: PriceAlert): AlertNode {
    const dirIcon = alert.direction === 'up' ? '▲' : '▼';
    const dirWord = alert.direction === 'up' ? '涨到' : '跌到';
    // Target price uses the same market-aware precision as live prices.
    const targetStr = formatPriceByMarket(alert.targetPrice, alert.symbol.market);

    const quote = this.quotes.get(alert.symbol.raw);

    // HK alerts show the live Chinese name from EastMoney (e.g. "美团-W")
    // instead of the bare code. The stored alert.name may be a code if it was
    // captured before quote data arrived. US alerts keep their stored ticker
    // name — unchanged.
    const isHk = alert.symbol.market === 'hk';
    const liveName = quote?.name;
    const displayName = isHk && liveName ? liveName : alert.name;

    // ── Engine state derivation (must match AlertEngine.evaluate exactly) ──
    // `triggered` mirrors the engine's condition (used for the ✓ marker and
    // tooltip). The icon no longer tracks the armed/disarmed state — recurring
    // alerts stay colored while waiting for a retreat to re-arm, so users see
    // the alert is still alive and will fire again on the next crossing.
    const triggered = quote
      ? alert.direction === 'up'
        ? quote.price >= alert.targetPrice
        : quote.price <= alert.targetPrice
      : false;

    // ── Status tag (exhaustive state matrix, see class doc) ──
    let statusTag: string;
    if (!alert.enabled) {
      statusTag = '已停用';
    } else if (!alert.armed) {
      statusTag = '待回落';
    } else {
      statusTag = '监听中';
    }

    // ── Live price block: same visual language as the watchlist
    // (price + arrow + changePct), plus a ✓ when the condition currently holds.
    let liveBlock: string;
    if (quote) {
      const up = isUp(quote);
      const flat = quote.price === quote.prevClose;
      const arrow = up ? (flat ? '—' : '▲') : '▼';
      const metMark = triggered ? ' ✓' : '';
      liveBlock = `现价 ${formatPrice(quote)} ${arrow} ${formatChangePct(quote)}${metMark}`;
    } else {
      liveBlock = '等待行情';
    }

    const label = `${displayName} ${dirIcon}${dirWord} ${targetStr}`;
    // HK: show market tag + Chinese name (no bare code).
    // US: keep the original `美股 AAPL` format.
    const idPart = isHk
      ? `${formatMarketTag(alert.symbol.market)} ${displayName}`
      : `${formatMarketTag(alert.symbol.market)} ${alert.symbol.code}`;
    const description =
      `${idPart} · ${liveBlock} · ${statusTag}`;

    const node = new AlertNode(label, alert.id, vscode.TreeItemCollapsibleState.None);
    node.description = description;

    // ── Tooltip: full state detail for hover ──
    const lines: string[] = [`${displayName} (${alert.symbol.code})`];
    lines.push(`${dirWord} ${targetStr} · ${statusTag}`);
    if (quote) {
      lines.push(`现价 ${formatPrice(quote)}（昨收 ${quote.prevClose}）${triggered ? ' · 条件已满足' : ' · 条件未满足'}`);
    }
    if (!alert.enabled) {
      lines.push(alert.armed ? '已装填' : '待回落重新装填');
    } else {
      lines.push(alert.armed ? '已装填 · 等待穿越触发' : '已触发 · 等待价格回落重新装填');
    }
    if (alert.fireCount > 0) {
      const last = alert.lastFiredAt ? ` · 最近 ${new Date(alert.lastFiredAt).toLocaleString()}` : '';
      lines.push(`累计触发 ${alert.fireCount} 次${last}`);
    }
    node.tooltip = lines.join('\n');

    // ── Icon: enabled alerts stay colored (up/down) even while disarmed
    // (待回落); only disabled alerts (manually off) go flat. This keeps the
    // alert visually "alive" so users know it will fire again on the next
    // threshold crossing.
    node.iconPath = mediaIcon(alert.enabled ? (alert.direction === 'up' ? 'up.svg' : 'down.svg') : 'flat.svg');

    node.contextValue = alert.enabled ? 'alertOn' : 'alertOff';
    return node;
  }
}

/** Tree node carrying an alert id (used by toggle/remove commands). */
export class AlertNode extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly alertId: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}
