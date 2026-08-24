import * as vscode from 'vscode';
import type { PriceAlert } from '../types/alert';

const STORAGE_KEY = 'stocksTicker.alerts.v1';

/**
 * Persistent store for price alerts, backed by VSCode globalState.
 * Mirrors the WatchlistStore pattern: a single array of records under one key.
 */
export class AlertStore {
  constructor(private readonly storage: vscode.Memento) {}

  async getAll(): Promise<PriceAlert[]> {
    return this.storage.get<PriceAlert[]>(STORAGE_KEY) ?? [];
  }

  async add(alert: PriceAlert): Promise<void> {
    const list = await this.getAll();
    await this.storage.update(STORAGE_KEY, [...list, alert]);
  }

  async remove(id: string): Promise<void> {
    const list = await this.getAll();
    const next = list.filter((a) => a.id !== id);
    await this.storage.update(STORAGE_KEY, next);
  }

  async update(id: string, patch: Partial<PriceAlert>): Promise<void> {
    const list = await this.getAll();
    const idx = list.findIndex((a) => a.id === id);
    if (idx < 0) {
      return;
    }
    list[idx] = { ...list[idx], ...patch };
    await this.storage.update(STORAGE_KEY, list);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.update(id, { enabled });
  }

  /** Replace the entire list (used by the engine to persist batch state changes). */
  async saveAll(list: PriceAlert[]): Promise<void> {
    await this.storage.update(STORAGE_KEY, list);
  }

  async clear(): Promise<void> {
    await this.storage.update(STORAGE_KEY, []);
  }
}
