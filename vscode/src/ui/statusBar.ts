import * as vscode from 'vscode';
import { formatChangePct, formatMarketTag, formatPrice, isUp } from '../utils/format';
import type { Quote } from '../types/stock';

/**
 * Rotating status-bar ticker using TWO items:
 *  - nameItem: "HK 00700 腾讯控股" (default theme color)
 *  - priceItem: "312.4 ▲ +0.58%" (red/green by direction, A-share convention)
 *
 * Supports a lock mode: when locked, the ticker stops rotating and shows only
 * the locked stock. Clicking the status bar toggles lock when a stock is shown.
 */
export class StatusBarController {
  private readonly nameItem: vscode.StatusBarItem;
  private readonly priceItem: vscode.StatusBarItem;
  private index = 0;
  private lockedRaw: string | undefined;

  /** Callback when user clicks the status bar (toggles lock). */
  onToggleLock?: () => void;

  constructor() {
    this.nameItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
    this.priceItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.nameItem.command = 'stocksTicker.toggleLock';
    this.priceItem.command = 'stocksTicker.toggleLock';
    this.nameItem.text = '$(pulse) 股票行情';
    this.nameItem.tooltip = '股票行情 — 点击锁定/解锁轮播';
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

  /** Lock the ticker to a specific stock (stop rotating). */
  lock(raw: string): void {
    this.lockedRaw = raw;
  }

  /** Unlock and resume rotating. */
  unlock(): void {
    this.lockedRaw = undefined;
  }

  isLocked(): boolean {
    return this.lockedRaw !== undefined;
  }

  getLockedRaw(): string | undefined {
    return this.lockedRaw;
  }

  update(quotes: Quote[]): void {
    if (quotes.length === 0) {
      // No stocks in the rotation pool — prompt the user to add some.
      this.nameItem.text = '$(pulse) 股票行情（无轮播）';
      this.nameItem.color = undefined;
      this.nameItem.tooltip = '右键侧边栏个股 →「加入轮播」即可在状态栏轮播显示';
      this.priceItem.text = '';
      this.priceItem.color = undefined;
      this.priceItem.hide();
      return;
    }

    // If locked, find the locked quote; if missing (e.g. removed), fall back to first.
    let q: Quote;
    let positionLabel: string;
    if (this.lockedRaw) {
      const found = quotes.find((x) => x.symbol.raw === this.lockedRaw);
      if (found) {
        q = found;
        const idx = quotes.findIndex((x) => x.symbol.raw === this.lockedRaw) + 1;
        positionLabel = ` [🔒 ${idx}/${quotes.length}]`;
      } else {
        // Locked stock no longer in watchlist — release lock.
        this.lockedRaw = undefined;
        this.index = 0;
        q = quotes[0];
        positionLabel = ` [1/${quotes.length}]`;
      }
    } else {
      const current = this.index % quotes.length;
      q = quotes[current];
      positionLabel = ` [${current + 1}/${quotes.length}]`;
      this.index++;
    }

    const up = isUp(q);
    const arrow = up ? '▲' : '▼';
    const extTag = q.isExtended === 'pre' ? ' [盘前]' : q.isExtended === 'post' ? ' [盘后]' : '';

    // Name item: default color, shows market + code + name (+ tags + progress).
    this.nameItem.text = `$(pulse) ${formatMarketTag(q.symbol.market)} ${q.symbol.code} ${q.name}${extTag}${positionLabel}`;
    this.nameItem.color = undefined;
    this.nameItem.tooltip = `${q.name} · 昨收 ${q.prevClose} · 开盘 ${q.open} · 成交量 ${q.volume}${extTag} — 点击锁定/解锁`;

    // Price item: colored red/green, shows price + arrow + change pct.
    this.priceItem.text = `${formatPrice(q)} ${arrow}${formatChangePct(q)}`;
    this.priceItem.color = up ? '#F23645' : '#089981';
    this.priceItem.tooltip = this.nameItem.tooltip;
    this.priceItem.show();
  }

  /** Show a single quote immediately (used by sidebar click-to-follow). */
  showSingle(quote: Quote): void {
    this.lock(quote.symbol.raw);
    this.update([quote]);
  }

  setError(message: string): void {
    this.nameItem.text = `$(error) ${message}`;
    this.nameItem.color = undefined;
    this.priceItem.text = '';
    this.priceItem.color = undefined;
    this.priceItem.hide();
  }

  dispose(): void {
    this.nameItem.dispose();
    this.priceItem.dispose();
  }
}
