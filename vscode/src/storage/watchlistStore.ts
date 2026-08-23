import * as vscode from 'vscode';
import type { StockSymbol, WatchlistItem } from '../types/stock';

const STORAGE_KEY = 'stocksTicker.watchlist.v1';

export class WatchlistStore {
  constructor(private readonly storage: vscode.Memento) {}

  async getAll(): Promise<WatchlistItem[]> {
    return this.storage.get<WatchlistItem[]>(STORAGE_KEY) ?? [];
  }

  async add(symbol: StockSymbol, name: string): Promise<WatchlistItem> {
    const list = await this.getAll();
    const existing = list.find((it) => it.symbol.raw === symbol.raw);
    if (existing) {
      return existing;
    }
    const item: WatchlistItem = { symbol, name, addedAt: Date.now() };
    await this.storage.update(STORAGE_KEY, [...list, item]);
    return item;
  }

  async remove(raw: string): Promise<void> {
    const list = await this.getAll();
    const next = list.filter((it) => it.symbol.raw !== raw);
    await this.storage.update(STORAGE_KEY, next);
  }

  async has(raw: string): Promise<boolean> {
    const list = await this.getAll();
    return list.some((it) => it.symbol.raw === raw);
  }

  /** Rename the display name of a watched stock. */
  async rename(raw: string, newName: string): Promise<void> {
    const list = await this.getAll();
    const idx = list.findIndex((it) => it.symbol.raw === raw);
    if (idx < 0) {
      return;
    }
    list[idx] = { ...list[idx], name: newName };
    await this.storage.update(STORAGE_KEY, list);
  }

  /** Move an item to a new index (for drag-to-reorder). */
  async moveTo(raw: string, newIndex: number): Promise<void> {
    const list = await this.getAll();
    const fromIdx = list.findIndex((it) => it.symbol.raw === raw);
    if (fromIdx < 0 || fromIdx === newIndex) {
      return;
    }
    const [item] = list.splice(fromIdx, 1);
    const clamped = Math.max(0, Math.min(newIndex, list.length));
    list.splice(clamped, 0, item);
    await this.storage.update(STORAGE_KEY, list);
  }

  /** Pin an item to the top (sets pinned=true, keeps relative order of other pinned items). */
  async setPinned(raw: string, pinned: boolean): Promise<void> {
    const list = await this.getAll();
    const idx = list.findIndex((it) => it.symbol.raw === raw);
    if (idx < 0) {
      return;
    }
    list[idx] = { ...list[idx], pinned };
    // Pinned items float to top; preserve insertion order within each group.
    list.sort((a, b) => {
      const pa = a.pinned ? 0 : 1;
      const pb = b.pinned ? 0 : 1;
      if (pa !== pb) {
        return pa - pb;
      }
      return (a.addedAt ?? 0) - (b.addedAt ?? 0);
    });
    await this.storage.update(STORAGE_KEY, list);
  }

  /** Remove all watched stocks. */
  async clear(): Promise<void> {
    await this.storage.update(STORAGE_KEY, []);
  }

  /** Toggle whether a stock participates in status-bar rotation. */
  async setRotation(raw: string, inRotation: boolean): Promise<void> {
    const list = await this.getAll();
    const idx = list.findIndex((it) => it.symbol.raw === raw);
    if (idx < 0) {
      return;
    }
    list[idx] = { ...list[idx], inRotation };
    await this.storage.update(STORAGE_KEY, list);
  }
}
