import * as vscode from 'vscode';
import { formatChangePct, formatDisplayName, formatMarketTag, formatPrice, isUp } from '../utils/format';
import type { Quote } from '../types/stock';

/**
 * Rotating status-bar ticker using TWO items:
 *  - nameItem: "HK 00700 腾讯控股" (default theme color)
 *  - priceItem: "312.4 ▲ +0.58%" (red/green by direction, A-share convention)
 *
 * Clicking the status bar triggers a refresh. `showSingle` peeks a single quote
 * (used by sidebar selection follow) — the next poll tick resumes rotation.
 */
export class StatusBarController {
  private readonly nameItem: vscode.StatusBarItem;
  private readonly priceItem: vscode.StatusBarItem;
  private index = 0;

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
    const current = this.index % quotes.length;
    const q = quotes[current];
    const positionLabel = ` [${current + 1}/${quotes.length}]`;
    this.index++;
    this.render(q, positionLabel);
  }

  /** Show a single quote immediately as a one-shot peek (next poll resumes rotation). */
  showSingle(quote: Quote): void {
    this.render(quote, ' [查看]');
  }

  private render(q: Quote, positionLabel: string): void {
    const up = isUp(q);
    const arrow = up ? '▲' : '▼';
    const extTag = q.isExtended === 'pre' ? ' [盘前]' : q.isExtended === 'post' ? ' [盘后]' : '';
    this.nameItem.text = `$(pulse) ${formatMarketTag(q.symbol.market)} ${q.symbol.code} ${formatDisplayName(q.symbol.market, q.name, q.symbol.code)}${extTag}${positionLabel}`;
    this.nameItem.color = undefined;
    this.nameItem.tooltip = `${q.name} · 昨收 ${q.prevClose} · 开盘 ${q.open} · 成交量 ${q.volume}${extTag} — 点击刷新`;
    this.priceItem.text = `${formatPrice(q)} ${arrow}${formatChangePct(q)}`;
    this.priceItem.color = up ? '#F23645' : '#089981';
    this.priceItem.tooltip = this.nameItem.tooltip;
    this.priceItem.show();
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
