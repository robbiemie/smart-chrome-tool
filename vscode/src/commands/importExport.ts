import * as vscode from 'vscode';
import type { WatchlistStore } from '../storage/watchlistStore';
import type { WatchlistItem } from '../types/stock';

/** Export watchlist to a JSON file chosen by the user. */
export async function exportJsonCommand(store: WatchlistStore): Promise<void> {
  const list = await store.getAll();
  if (list.length === 0) {
    vscode.window.showWarningMessage('自选股为空，无可导出内容。');
    return;
  }
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`stocks-ticker-watchlist-${new Date().toISOString().slice(0, 10)}.json`),
    filters: { 'JSON 文件': ['json'] },
    saveLabel: '导出',
    title: '导出自选股',
  });
  if (!uri) {
    return;
  }
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: list.length,
    items: list,
  };
  const text = JSON.stringify(payload, null, 2);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
  vscode.window.showInformationMessage(`已导出 ${list.length} 只自选股到 ${uri.fsPath}。`);
}

/** Import watchlist from a JSON file chosen by the user (merges, skips duplicates). */
export async function importJsonCommand(
  store: WatchlistStore,
  onChanged?: () => void
): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'JSON 文件': ['json'] },
    openLabel: '导入',
    title: '选择要导入的自选股 JSON 文件',
  });
  if (!uris || uris.length === 0) {
    return;
  }
  const uri = uris[0];
  let text: string;
  try {
    const buf = await vscode.workspace.fs.readFile(uri);
    text = Buffer.from(buf).toString('utf8');
  } catch (err) {
    vscode.window.showErrorMessage(`读取文件失败：${err}`);
    return;
  }
  let payload: { items?: WatchlistItem[] };
  try {
    payload = JSON.parse(text);
  } catch {
    vscode.window.showErrorMessage('JSON 格式错误，无法解析。');
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    vscode.window.showWarningMessage('文件中没有可导入的自选股。');
    return;
  }
  let added = 0;
  let skipped = 0;
  for (const it of items) {
    if (!it?.symbol?.raw || !it?.symbol?.market || !it?.symbol?.code) {
      skipped++;
      continue;
    }
    const exists = await store.has(it.symbol.raw);
    if (exists) {
      skipped++;
      continue;
    }
    await store.add(it.symbol, it.name ?? it.symbol.code);
    if (it.pinned) {
      await store.setPinned(it.symbol.raw, true);
    }
    added++;
  }
  vscode.window.showInformationMessage(`导入完成：新增 ${added} 只，跳过 ${skipped} 只（已存在或格式无效）。`);
  onChanged?.();
}
