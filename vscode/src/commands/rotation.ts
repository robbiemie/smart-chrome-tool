import * as vscode from 'vscode';
import type { WatchlistStore } from '../storage/watchlistStore';

/** Add a stock to the status-bar rotation pool. */
export async function joinRotationCommand(
  store: WatchlistStore,
  node: { symbol?: { raw?: string } } | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.symbol?.raw) {
    return;
  }
  await store.setRotation(node.symbol.raw, true);
  onChanged?.();
}

/** Remove a stock from the status-bar rotation pool. */
export async function leaveRotationCommand(
  store: WatchlistStore,
  node: { symbol?: { raw?: string } } | undefined,
  onChanged?: () => void
): Promise<void> {
  if (!node?.symbol?.raw) {
    return;
  }
  await store.setRotation(node.symbol.raw, false);
  onChanged?.();
}
