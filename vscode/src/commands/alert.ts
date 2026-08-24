import * as vscode from 'vscode';
import { formatMarketTag } from '../utils/format';
import type { AlertDirection, AlertMode, PriceAlert } from '../types/alert';
import type { WatchlistItem } from '../types/stock';
import type { AlertStore } from '../storage/alertStore';

/** Node shape accepted by alert commands (the AlertTreeProvider's AlertNode). */
interface AlertNodeLike {
  alertId?: string;
}

/** Generate a unique alert id. */
function makeAlertId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a fresh alert record (always starts enabled + armed). */
function buildAlert(
  symbol: WatchlistItem['symbol'],
  name: string,
  targetPrice: number,
  direction: AlertDirection,
  mode: AlertMode,
  note?: string
): PriceAlert {
  return {
    id: makeAlertId(),
    symbol,
    name,
    targetPrice,
    direction,
    mode,
    enabled: true,
    createdAt: Date.now(),
    fireCount: 0,
    armed: true,
    note: note?.trim() || undefined,
  };
}

/**
 * Add a price alert via a guided flow:
 *   1. Pick a stock (skipped if `node` already carries a symbol, e.g. right-clicked
 *      from the watchlist).
 *   2. Enter target price (validated as a positive number).
 *   3. Pick direction: 涨到 / 跌到.
 *   4. Pick mode: 单次 / 多次.
 *   5. Optional note.
 */
export async function addAlertCommand(
  store: AlertStore,
  getWatchlist: () => WatchlistItem[],
  node: { symbol?: WatchlistItem['symbol']; label?: string } | undefined,
  onChanged?: () => void
): Promise<void> {
  // --- Step 1: resolve the target stock symbol + name. ---
  let symbol = node?.symbol;
  let name: string | undefined;
  if (symbol) {
    // Prefer the watchlist's stored name (clean — tree labels carry decorations like ⊙).
    const watched = getWatchlist().find((it) => it.symbol.raw === symbol!.raw);
    name = watched?.name ?? symbol.code;
  } else {
    const list = getWatchlist();
    if (list.length === 0) {
      vscode.window.showWarningMessage('自选股为空，请先添加股票再设置提醒。');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      list.map((it) => ({
        label: `$(bell) ${it.name}`,
        description: `${formatMarketTag(it.symbol.market)} ${it.symbol.code}`,
        detail: '为该股票设置价格提醒',
        item: it,
      })),
      { placeHolder: '选择要设置提醒的股票', matchOnDescription: true }
    );
    if (!picked) {
      return;
    }
    symbol = picked.item.symbol;
    name = picked.item.name;
  }

  // --- Step 2: target price (positive number). ---
  const priceInput = await vscode.window.showInputBox({
    prompt: '输入目标价格',
    placeHolder: '如 350.0',
    validateInput: (v) => {
      const n = Number(v);
      if (!v.trim() || Number.isNaN(n) || n <= 0) {
        return '请输入大于 0 的数字';
      }
      return null;
    },
  });
  if (priceInput === undefined) {
    return;
  }
  const targetPrice = Number(priceInput);

  // --- Step 3: direction. ---
  // Colored emoji (🔴 red up / 🟢 green down) match the status bar's A-share
  // convention (#F23645 red = up, #089981 green = down). QuickPick labels can't
  // be colorized via API, so emoji is the only reliable cross-platform way to
  // make rise/fall visually distinguishable here.
  const dirPicked = await vscode.window.showQuickPick(
    [
      { label: `🔴 ▲ 涨到`, description: `现价 ≥ ${targetPrice} 时提醒`, direction: 'up' as AlertDirection },
      { label: `🟢 ▼ 跌到`, description: `现价 ≤ ${targetPrice} 时提醒`, direction: 'down' as AlertDirection },
    ],
    { placeHolder: '选择触发方向' }
  );
  if (!dirPicked) {
    return;
  }

  // --- Step 4: mode. ---
  const modePicked = await vscode.window.showQuickPick(
    [
      { label: '单次', description: '触发一次后自动停用（止盈/止损单）', mode: 'once' as AlertMode },
      { label: '多次', description: '每次穿越阈值都提醒（边沿触发，不刷屏）', mode: 'recurring' as AlertMode },
    ],
    { placeHolder: '选择提醒模式' }
  );
  if (!modePicked) {
    return;
  }

  // --- Step 5: optional note. ---
  const note = await vscode.window.showInputBox({
    prompt: '备注（可选，会显示在提醒中）',
    placeHolder: '如：第一目标位',
  });

  const alert = buildAlert(symbol, name ?? symbol.code, targetPrice, dirPicked.direction, modePicked.mode, note);
  await store.add(alert);
  vscode.window.showInformationMessage(
    `已设置提醒：${alert.name} ${dirPicked.direction === 'up' ? '涨到' : '跌到'} ${targetPrice}（${modePicked.mode === 'once' ? '单次' : '多次'}）`
  );
  onChanged?.();
}

/** Toggle an alert on/off (re-arms a recurring alert when re-enabled). */
export async function toggleAlertCommand(
  store: AlertStore,
  node: AlertNodeLike | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.alertId) {
    return;
  }
  const list = await store.getAll();
  const alert = list.find((a) => a.id === node.alertId);
  if (!alert) {
    return;
  }
  const nextEnabled = !alert.enabled;
  // Re-arm when manually re-enabling so a recurring alert is ready to fire again.
  await store.update(alert.id, { enabled: nextEnabled, armed: nextEnabled ? true : alert.armed });
  onChanged?.();
}

/** Remove a single alert. */
export async function removeAlertCommand(
  store: AlertStore,
  node: AlertNodeLike | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.alertId) {
    return;
  }
  await store.remove(node.alertId);
  onChanged?.();
}

/** Remove all alerts after confirmation. */
export async function clearAlertsCommand(
  store: AlertStore,
  onChanged?: () => void
): Promise<void> {
  const list = await store.getAll();
  if (list.length === 0) {
    vscode.window.showInformationMessage('没有价格提醒。');
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `确定清空全部 ${list.length} 条价格提醒？此操作不可撤销。`,
    { modal: true },
    '清空'
  );
  if (confirm !== '清空') {
    return;
  }
  await store.clear();
  vscode.window.showInformationMessage('已清空全部价格提醒。');
  onChanged?.();
}
