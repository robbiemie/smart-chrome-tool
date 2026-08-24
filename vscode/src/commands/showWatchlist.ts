import * as vscode from 'vscode';
import { formatChangePct, formatDisplayName, formatMarketTag, formatPrice, isUp } from '../utils/format';
import type { Quote } from '../types/stock';

/**
 * Show all watchlist quotes in a Quick Pick.
 * Quotes are fetched by the caller and passed in.
 */
export async function showWatchlistCommand(quotes: Quote[]): Promise<void> {
  if (quotes.length === 0) {
    vscode.window.showInformationMessage('自选股为空或暂无行情数据。');
    return;
  }
  const items = quotes.map((q) => {
    const up = isUp(q);
    const icon = up ? '$(arrow-up)' : '$(arrow-down)';
    return {
      label: `${icon} ${formatDisplayName(q.symbol.market, q.name, q.symbol.code)}  ${formatPrice(q)}`,
      description: `${formatMarketTag(q.symbol.market)} ${q.symbol.code}  ${formatChangePct(q)}`,
      detail: `昨收 ${q.prevClose} · 开盘 ${q.open} · 成交量 ${q.volume}`,
    };
  });
  await vscode.window.showQuickPick(items, { placeHolder: '自选股', matchOnDescription: true });
}
