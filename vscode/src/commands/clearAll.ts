import * as vscode from 'vscode';
import type { WatchlistStore } from '../storage/watchlistStore';

/** Remove all watched stocks after confirmation. */
export async function clearAllCommand(
  store: WatchlistStore,
  onChanged?: () => void
): Promise<void> {
  const list = await store.getAll();
  if (list.length === 0) {
    vscode.window.showInformationMessage('自选股已为空。');
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `确定清空全部 ${list.length} 只自选股？此操作不可撤销。`,
    { modal: true },
    '清空'
  );
  if (confirm !== '清空') {
    return;
  }
  await store.clear();
  vscode.window.showInformationMessage('已清空自选股。');
  onChanged?.();
}
