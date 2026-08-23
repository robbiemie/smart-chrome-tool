import * as vscode from 'vscode';
import type { WatchlistStore } from '../storage/watchlistStore';

/** Rename a watched stock's display name via input box. */
export async function renameCommand(
  store: WatchlistStore,
  node: { symbol?: { raw?: string }; label?: string } | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.symbol?.raw) {
    vscode.window.showWarningMessage('请从侧边栏右键选择一只股票再重命名。');
    return;
  }
  const raw = node.symbol.raw;
  const current = node.label?.replace(/[📌🔒]/g, '').trim() ?? '';
  const input = await vscode.window.showInputBox({
    prompt: '输入新的显示名称',
    value: current,
    placeHolder: '如：腾讯控股（港股核心）',
  });
  if (!input || input === current) {
    return;
  }
  await store.rename(raw, input);
  vscode.window.showInformationMessage(`已重命名为 ${input}。`);
  onChanged?.();
}
