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

  /**
   * One-shot migration: drop the legacy `mode` field and revive alerts that
   * were auto-disabled by the old `once` mode (which fired once then set
   * `enabled=false`). After migration every alert behaves as edge-triggered
   * (the only behavior now), so spent one-shots are re-enabled + re-armed to
   * keep watching. Idempotent — runs on every activation but only writes when
   * a legacy record is actually touched.
   */
  async migrate(): Promise<void> {
    const list = await this.getAll();
    // Loose-typed read: legacy records may carry `mode` / be disabled by the
    // old once-mode auto-disable. We narrow them back to the current shape.
    const legacy = list as Array<PriceAlert & { mode?: string }>;
    let dirty = false;
    const next = legacy.map((a) => {
      if (a.mode === undefined && a.enabled !== false) {
        return a;
      }
      dirty = true;
      // Strip the legacy `mode` field; revive once-mode spent alerts.
      const { mode: _drop, ...rest } = a;
      return {
        ...rest,
        // Re-enable + re-arm any alert disabled by the old once-mode auto-disable,
        // so it resumes watching under the new edge-triggered behavior.
        enabled: true,
        armed: true,
      };
    });
    if (dirty) {
      await this.storage.update(STORAGE_KEY, next);
    }
  }
}
