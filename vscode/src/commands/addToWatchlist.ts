import * as vscode from 'vscode';
import { fetchQuotes } from '../providers/tencent';
import { resolveSymbol } from '../providers/stockSearch';
import { suggest } from '../providers/suggest';
import { formatMarketTag } from '../utils/format';
import type { StockSymbol } from '../types/stock';
import type { WatchlistStore } from '../storage/watchlistStore';

interface AddPickItem extends vscode.QuickPickItem {
  pendingSymbol?: StockSymbol;
  pendingName?: string;
}

/**
 * Add to watchlist via Quick Pick with autocomplete suggestions.
 * Mirrors the query command UX: type → suggest → select → add directly.
 *
 * `onChanged` is invoked after a successful add so the caller can refresh
 * the status bar / tree immediately (qp.show is non-blocking, so the caller
 * cannot reliably await this function for post-add side effects).
 */
export async function addToWatchlistCommand(
  store: WatchlistStore,
  onChanged?: () => void
): Promise<void> {
  const qp = vscode.window.createQuickPick<AddPickItem>();
  qp.placeholder = '输入代码或名称（如 00700 / 腾讯 / AAPL / Apple），选中后直接添加';
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
            label: `$(add) ${s.name}`,
            description: `${formatMarketTag(s.symbol.market)} ${s.symbol.code}`,
            detail: '按 Enter 添加到自选股',
            pendingSymbol: s.symbol,
            pendingName: s.name,
          }));
          return;
        }
        const symbol = resolveSymbol(trimmed);
        if (symbol) {
          qp.items = [
            {
              label: `$(add) ${symbol.code}`,
              description: `${formatMarketTag(symbol.market)} ${symbol.code}`,
              detail: '按 Enter 添加到自选股',
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
    if (!picked?.pendingSymbol) {
      return;
    }
    const symbol = picked.pendingSymbol;
    // Fetch quote to get the proper display name; fall back to suggested name / code.
    let name = picked.pendingName ?? symbol.code;
    try {
      const [quote] = await fetchQuotes([symbol]);
      if (quote) {
        name = quote.name;
      }
    } catch {
      // ignore — use suggested name
    }
    qp.hide();
    const inList = await store.has(symbol.raw);
    if (inList) {
      vscode.window.showInformationMessage(`${name} (${symbol.code}) 已在自选股中。`);
      return;
    }
    await store.add(symbol, name);
    vscode.window.showInformationMessage(`已添加 ${name} (${symbol.code}) 到自选股。`);
    onChanged?.();
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
