import * as vscode from 'vscode';
import { formatChangePct, formatDisplayName, formatMarketTag, formatPrice, isUp, changeBaseline } from '../utils/format';
import type { Quote } from '../types/stock';

/**
 * Per-stock display duration for the rotating status bar (milliseconds).
 * Decoupled from the poll interval: regardless of how often quotes refresh,
 * each stock in the rotation pool stays on screen for this long so the user
 * has time to read it. Tuned to ~8s as requested.
 */
const ROTATION_INTERVAL_MS = 8000;

/**
 * Rotating status-bar ticker using TWO items:
 *  - nameItem: "HK 00700 腾讯控股" (default theme color)
 *  - priceItem: "312.4 ▲ +0.58%" (red/green by direction, A-share convention)
 *
 * Rotation runs on its OWN timer (ROTATION_INTERVAL_MS), independent of poll
 * ticks. Previously `update()` was called on every poll tick and advanced the
 * index each time — but HK and US poll independently (~8s each), so the two
 * streams of ticks interleaved and effectively rotated every ~4s, too fast.
 * Now `update()` only refreshes the *current* stock's price in place; the
 * internal timer advances *which* stock is shown.
 *
 * Clicking the status bar triggers a refresh. `showSingle` peeks a single
 * quote (used by sidebar selection follow) — the next rotation tick resumes.
 */
export class StatusBarController {
  private readonly nameItem: vscode.StatusBarItem;
  private readonly priceItem: vscode.StatusBarItem;
  private index = 0;
  private rotationTimer: NodeJS.Timeout | undefined;
  private quotes: Quote[] = [];
  /** When set, the controller is in "peek" mode (showSingle) and the rotation
   *  timer is paused until the next `update()` with a non-empty list. */
  private peeking = false;

  constructor() {
    this.nameItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
    this.priceItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.nameItem.command = 'stocksTicker.refresh';
    this.priceItem.command = 'stocksTicker.refresh';
    this.nameItem.text = '$(pulse) 股票行情';
    this.nameItem.tooltip = '股票行情 — 点击刷新';
    this.nameItem.show();
    this.priceItem.hide();
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.nameItem.show();
      this.priceItem.show();
    } else {
      this.nameItem.hide();
      this.priceItem.hide();
    }
  }

  /**
   * Refresh the rotation pool. Re-renders the *current* stock in place (with
   * its latest price); the internal timer handles advancing to the next stock.
   * Starting the rotation here on first non-empty input.
   */
  update(quotes: Quote[]): void {
    this.quotes = quotes;
    if (quotes.length === 0) {
      this.stopRotation();
      this.nameItem.text = '$(pulse) 股票行情（无轮播）';
      this.nameItem.color = undefined;
      this.nameItem.tooltip = '右键侧边栏个股 →「加入轮播」即可在状态栏轮播显示';
      this.priceItem.text = '';
      this.priceItem.color = undefined;
      this.priceItem.hide();
      return;
    }
    this.peeking = false;
    // Start the rotation timer if not running; keep it running across ticks.
    if (!this.rotationTimer) {
      this.renderCurrent();
      this.rotationTimer = setInterval(() => this.advance(), ROTATION_INTERVAL_MS);
    } else {
      // Timer already running — just refresh the current stock's price in place.
      this.renderCurrent();
    }
  }

  /** Show a single quote immediately as a one-shot peek (pauses rotation until next update). */
  showSingle(quote: Quote): void {
    this.peeking = true;
    this.stopRotation();
    this.quotes = [quote];
    this.index = 0;
    this.render(quote, ' [查看]');
  }

  private advance(): void {
    if (this.peeking || this.quotes.length === 0) {
      return;
    }
    this.index = (this.index + 1) % this.quotes.length;
    this.renderCurrent();
  }

  private renderCurrent(): void {
    if (this.quotes.length === 0) {
      return;
    }
    const current = this.index % this.quotes.length;
    const q = this.quotes[current];
    const positionLabel = ` [${current + 1}/${this.quotes.length}]`;
    this.render(q, positionLabel);
  }

  private stopRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
    }
  }

  private render(q: Quote, positionLabel: string): void {
    const up = isUp(q);
    const arrow = up ? '▲' : '▼';
    const extTag = q.isExtended === 'pre' ? ' [盘前]' : q.isExtended === 'post' ? ' [盘后]' : '';
    this.nameItem.text = `$(pulse) ${formatMarketTag(q.symbol.market)} ${q.symbol.code} ${formatDisplayName(q.symbol.market, q.name, q.symbol.code)}${extTag}${positionLabel}`;
    this.nameItem.color = undefined;
    this.nameItem.tooltip = `${q.name} · 昨收 ${changeBaseline(q)} · 开盘 ${q.open} · 成交量 ${q.volume}${extTag} — 点击刷新`;
    this.priceItem.text = `${formatPrice(q)} ${arrow}${formatChangePct(q)}`;
    this.priceItem.color = up ? '#F23645' : '#089981';
    this.priceItem.tooltip = this.nameItem.tooltip;
    this.priceItem.show();
  }

  /**
   * Show a transient "refreshing" state right after the user clicks the
   * status bar. The next update()/setError() call overwrites it, so no
   * explicit restore is needed.
   */
  setRefreshing(): void {
    this.nameItem.text = '$(loading~spin) 刷新中…';
    this.nameItem.color = undefined;
    this.nameItem.tooltip = '正在拉取最新行情…';
    this.priceItem.text = '';
    this.priceItem.color = undefined;
    this.priceItem.hide();
  }

  setError(message: string): void {
    this.nameItem.text = `$(error) ${message}`;
    this.nameItem.color = undefined;
    this.priceItem.text = '';
    this.priceItem.color = undefined;
    this.priceItem.hide();
  }

  dispose(): void {
    this.stopRotation();
    this.nameItem.dispose();
    this.priceItem.dispose();
  }
}
