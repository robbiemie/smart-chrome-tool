import * as vscode from 'vscode';
import type { WatchlistStore } from '../storage/watchlistStore';

export async function removeFromWatchlistCommand(store: WatchlistStore): Promise<void> {
  const list = await store.getAll();
  if (list.length === 0) {
    vscode.window.showInformationMessage('自选股为空。');
    return;
  }
  const picked = await vscode.window.showQuickPick(
    list.map((it) => ({ label: it.name, description: it.symbol.code, raw: it.symbol.raw })),
    { placeHolder: '选择要移除的股票' }
  );
  if (!picked) {
    return;
  }
  await store.remove(picked.raw);
  vscode.window.showInformationMessage(`已从自选股移除 ${picked.label}。`);
}
