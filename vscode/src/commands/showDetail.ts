import * as vscode from 'vscode';
import { formatChangePct, formatMarketTag, formatPrice, isUp } from '../utils/format';
import type { Quote, StockSymbol } from '../types/stock';

/**
 * Show a stock's detail in a Quick Pick.
 * Triggered by clicking the inline "detail" button or double-clicking a row.
 *
 * Also fires `onFollow` so the caller can make the status bar follow this stock.
 */
export async function showDetailCommand(
  symbol: StockSymbol,
  fetchQuote: (s: StockSymbol) => Promise<Quote | null>,
  onFollow?: (q: Quote) => void
): Promise<void> {
  let quote: Quote | null;
  try {
    quote = await fetchQuote(symbol);
  } catch {
    quote = null;
  }
  if (!quote) {
    vscode.window.showWarningMessage(`未获取到 ${symbol.code} 的行情数据。`);
    return;
  }

  const up = isUp(quote);
  const arrow = up ? '▲' : '▼';
  const extTag = quote.isExtended === 'pre' ? ' · 盘前' : quote.isExtended === 'post' ? ' · 盘后' : '';
  const items: (vscode.QuickPickItem & { action?: string })[] = [
    {
      label: `${arrow} ${quote.name}  ${formatPrice(quote)}  ${formatChangePct(quote)}${extTag}`,
      description: `${formatMarketTag(quote.symbol.market)} ${quote.symbol.code}`,
      detail: `昨收 ${quote.prevClose} · 开盘 ${quote.open} · 成交量 ${quote.volume}${quote.timestamp ? ' · ' + quote.timestamp : ''}`,
    },
    { label: '$(pin) 在状态栏锁定显示', action: 'lock' },
    { label: '$(refresh) 刷新', action: 'refresh' },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${quote.name} (${quote.symbol.code})`,
  });
  if (!picked) {
    return;
  }
  if (picked.action === 'lock') {
    onFollow?.(quote);
    vscode.window.showInformationMessage(`已在状态栏锁定 ${quote.name}。`);
  } else if (picked.action === 'refresh') {
    void showDetailCommand(symbol, fetchQuote, onFollow);
  }
}
