import * as vscode from 'vscode';
import { fetchQuotes } from '../providers/tencent';
import { resolveSymbol } from '../providers/stockSearch';
import { suggest } from '../providers/suggest';
import { formatChangePct, formatDisplayName, formatMarketTag, formatPrice, isUp } from '../utils/format';
import type { Quote, StockSymbol } from '../types/stock';

interface PickItem extends vscode.QuickPickItem {
  /** When set, this item carries a live quote (user picked a suggest result). */
  quote?: Quote;
  /** Symbol to fetch when the user accepts a suggestion without a quote yet. */
  pendingSymbol?: StockSymbol;
  pendingName?: string;
}

/**
 * Quick Pick query flow with autocomplete suggestions.
 *
 * 1. User types → onDidChangeValue (debounced) calls Tencent smartbox suggest.
 *    Each candidate is shown with name + market tag (no quote yet, to stay fast).
 * 2. User picks a candidate → fetch live quote, show as a single result item.
 * 3. Accepting the quote item opens an action menu: add / remove / re-query.
 *
 * Fallback: if suggest returns nothing but the input resolves to a valid symbol
 * shape (e.g. user pasted an exact code), fetch the quote directly.
 */
export async function queryCommand(
  watchlist: { add: (s: StockSymbol, name: string) => Promise<unknown>; has: (raw: string) => Promise<boolean>; remove: (raw: string) => Promise<void> }
): Promise<void> {
  const qp = vscode.window.createQuickPick<PickItem>();
  qp.placeholder = '输入代码或名称（如 00700 / 腾讯 / AAPL / Apple）';
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;

  let timer: NodeJS.Timeout | undefined;
  let cancelled = false;

  qp.onDidChangeValue((value) => {
    if (timer) {
      clearTimeout(timer);
    }
    const trimmed = value.trim();
    if (!trimmed) {
      qp.items = [];
      return;
    }
    qp.busy = true;
    timer = setTimeout(async () => {
      try {
        const suggestions = await suggest(trimmed, 20);
        if (cancelled) {
          return;
        }
        if (suggestions.length > 0) {
          qp.items = suggestions.map((s) => ({
            label: `$(search) ${s.name}`,
            description: `${formatMarketTag(s.symbol.market)} ${s.symbol.code}`,
            detail: '按 Enter 查看实时行情',
            pendingSymbol: s.symbol,
            pendingName: s.name,
          }));
          return;
        }
        // No suggestions: try direct symbol resolution as a fallback.
        const symbol = resolveSymbol(trimmed);
        if (symbol) {
          qp.items = [
            {
              label: `$(search) ${symbol.code}`,
              description: `${formatMarketTag(symbol.market)} ${symbol.code}`,
              detail: '按 Enter 查看实时行情',
              pendingSymbol: symbol,
              pendingName: symbol.code,
            },
          ];
        } else {
          qp.items = [{ label: '$(warning) 未匹配到股票', description: trimmed, detail: '请检查代码或关键词。' }];
        }
      } catch {
        if (!cancelled) {
          qp.items = [{ label: '$(error) 联想请求失败', description: trimmed, detail: '网络异常，请稍后重试。' }];
        }
      } finally {
        qp.busy = false;
      }
    }, 250);
  });

  qp.onDidAccept(async () => {
    const picked = qp.selectedItems[0];
    if (!picked) {
      return;
    }

    // Already have a quote → go to action menu.
    if (picked.quote) {
      await showActionMenu(watchlist, picked.quote);
      return;
    }

    // Pending symbol → fetch quote inline, replace items with the single result.
    const symbol = picked.pendingSymbol;
    if (!symbol) {
      return;
    }
    qp.busy = true;
    try {
      const [quote] = await fetchQuotes([symbol]);
      if (cancelled) {
        return;
      }
      if (!quote) {
        qp.items = [{ label: '$(warning) 暂无数据', description: symbol.code, detail: '未获取到该股票的行情数据。' }];
        return;
      }
      const up = isUp(quote);
      const icon = up ? '$(arrow-up)' : '$(arrow-down)';
      const extTag = quote.isExtended === 'pre' ? ' · 盘前' : quote.isExtended === 'post' ? ' · 盘后' : '';
      qp.items = [
        {
          label: `${icon} ${formatDisplayName(quote.symbol.market, quote.name, quote.symbol.code)}  ${formatPrice(quote)}${extTag}`,
          description: `${formatMarketTag(quote.symbol.market)} ${quote.symbol.code}  ${formatChangePct(quote)}`,
          detail: `昨收 ${quote.prevClose} · 开盘 ${quote.open} · 成交量 ${quote.volume}${quote.timestamp ? ' · ' + quote.timestamp : ''}${quote.regularPrice != null && quote.regularPrice !== quote.price ? ' · 常规时段 ' + quote.regularPrice : ''}`,
          quote,
        },
      ];
    } catch (err) {
      if (!cancelled) {
        qp.items = [{ label: '$(error) 请求失败', description: symbol.code, detail: String(err) }];
      }
    } finally {
      qp.busy = false;
    }
  });

  qp.onDidHide(() => {
    cancelled = true;
    if (timer) {
      clearTimeout(timer);
    }
    qp.dispose();
  });

  qp.show();
}

async function showActionMenu(
  watchlist: { add: (s: StockSymbol, name: string) => Promise<unknown>; has: (raw: string) => Promise<boolean>; remove: (raw: string) => Promise<void> },
  quote: Quote
): Promise<void> {
  const inList = await watchlist.has(quote.symbol.raw);
  const action = await vscode.window.showQuickPick(
    [
      { label: inList ? '$(trash) 从自选股移除' : '$(add) 添加到自选股', action: inList ? 'remove' : 'add' },
      { label: '$(refresh) 重新查询', action: 'refresh' },
    ],
    { placeHolder: `${quote.name} (${quote.symbol.code})` }
  );
  if (!action) {
    return;
  }
  if (action.action === 'add') {
    await watchlist.add(quote.symbol, quote.name);
    vscode.window.showInformationMessage(`已添加 ${quote.name} 到自选股。`);
  } else if (action.action === 'remove') {
    await watchlist.remove(quote.symbol.raw);
    vscode.window.showInformationMessage(`已从自选股移除 ${quote.name}。`);
  } else if (action.action === 'refresh') {
    void queryCommand(watchlist);
  }
}
