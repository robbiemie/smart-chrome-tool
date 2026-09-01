import * as vscode from 'vscode';
import { formatChangePct, formatDisplayName, formatMarketTag, formatPrice, isUp } from '../utils/format';
import type { Quote, StockSymbol } from '../types/stock';

/**
 * Show a stock's detail in a Quick Pick.
 * Triggered by right-click →「查看详情」.
 *
 * `onFreshQuote` fires right after a successful fetch so the caller can sync
 * the sidebar list / status bar with the just-fetched quote — this prevents
 * the list-vs-detail price drift caused by the list showing a stale poller
 * cache while the detail view shows a live fetch.
 *
 * `onFollow` fires only when the user picks「在状态栏查看」(peeks the stock
 * in the status bar without disturbing rotation afterwards).
 */
export async function showDetailCommand(
  symbol: StockSymbol,
  fetchQuote: (s: StockSymbol) => Promise<Quote | null>,
  onFollow?: (q: Quote) => void,
  onFreshQuote?: (q: Quote) => void
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
  // Propagate the fresh quote so the caller can merge it into the sidebar
  // cache + re-render the list, keeping detail and list prices in sync.
  onFreshQuote?.(quote);

  const up = isUp(quote);
  const arrow = up ? '▲' : '▼';
  const extTag = quote.isExtended === 'pre' ? ' · 盘前' : quote.isExtended === 'post' ? ' · 盘后' : '';
  const range = quote.high != null && quote.low != null ? ` · 最高 ${quote.high} · 最低 ${quote.low}` : '';
  const items: (vscode.QuickPickItem & { action?: string })[] = [
    {
      label: `${arrow} ${formatDisplayName(quote.symbol.market, quote.name, quote.symbol.code)}  ${formatPrice(quote)}  ${formatChangePct(quote)}${extTag}`,
      description: `${formatMarketTag(quote.symbol.market)} ${quote.symbol.code}`,
      detail: `昨收 ${quote.prevClose} · 开盘 ${quote.open}${range} · 成交量 ${quote.volume}${quote.timestamp ? ' · ' + quote.timestamp : ''}`,
    },
    { label: '$(eye) 在状态栏查看', action: 'follow' },
    { label: '$(refresh) 刷新', action: 'refresh' },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${quote.name} (${quote.symbol.code})`,
  });
  if (!picked) {
    return;
  }
  if (picked.action === 'follow') {
    onFollow?.(quote);
  } else if (picked.action === 'refresh') {
    void showDetailCommand(symbol, fetchQuote, onFollow);
  }
}
