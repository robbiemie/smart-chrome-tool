import * as vscode from 'vscode';
import type { WatchlistStore } from '../storage/watchlistStore';

/** Pin a stock to the top of the watchlist. */
export async function pinCommand(
  store: WatchlistStore,
  node: { symbol?: { raw?: string } } | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.symbol?.raw) {
    return;
  }
  await store.setPinned(node.symbol.raw, true);
  onChanged?.();
}

/** Unpin a stock. */
export async function unpinCommand(
  store: WatchlistStore,
  node: { symbol?: { raw?: string } } | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.symbol?.raw) {
    return;
  }
  await store.setPinned(node.symbol.raw, false);
  onChanged?.();
}
