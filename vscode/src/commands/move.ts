import * as vscode from 'vscode';
import type { WatchlistStore } from '../storage/watchlistStore';

/** Move a stock one slot up in the watchlist. */
export async function moveUpCommand(
  store: WatchlistStore,
  node: { symbol?: { raw?: string } } | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.symbol?.raw) {
    return;
  }
  const list = await store.getAll();
  const idx = list.findIndex((it) => it.symbol.raw === node.symbol!.raw);
  if (idx <= 0) {
    return;
  }
  await store.moveTo(node.symbol.raw, idx - 1);
  onChanged?.();
}

/** Move a stock one slot down in the watchlist. */
export async function moveDownCommand(
  store: WatchlistStore,
  node: { symbol?: { raw?: string } } | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.symbol?.raw) {
    return;
  }
  const list = await store.getAll();
  const idx = list.findIndex((it) => it.symbol.raw === node.symbol!.raw);
  if (idx < 0 || idx >= list.length - 1) {
    return;
  }
  await store.moveTo(node.symbol.raw, idx + 1);
  onChanged?.();
}
