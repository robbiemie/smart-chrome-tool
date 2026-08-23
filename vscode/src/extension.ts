import * as vscode from 'vscode';
import { WatchlistStore } from './storage/watchlistStore';
import { StatusBarController } from './ui/statusBar';
import { WatchlistTreeProvider, TreeNode, isStockNode } from './ui/watchlistTreeProvider';
import { Poller } from './poll/poller';
import { queryCommand } from './commands/query';
import { addToWatchlistCommand } from './commands/addToWatchlist';
import { removeFromWatchlistCommand } from './commands/removeFromWatchlist';
import { showWatchlistCommand } from './commands/showWatchlist';
import { renameCommand } from './commands/rename';
import { pinCommand, unpinCommand } from './commands/pin';
import { moveUpCommand, moveDownCommand } from './commands/move';
import { clearAllCommand } from './commands/clearAll';
import { showDetailCommand } from './commands/showDetail';
import { exportJsonCommand, importJsonCommand } from './commands/importExport';
import { joinRotationCommand, leaveRotationCommand } from './commands/rotation';
import { fetchQuote } from './providers/tencent';
import type { Quote, WatchlistItem } from './types/stock';

let statusBar: StatusBarController | undefined;
let tree: WatchlistTreeProvider | undefined;
let poller: Poller | undefined;
let latestQuotes: Quote[] = [];
/** Cached watchlist — used to filter quotes into the rotation subset. */
let currentWatchlist: WatchlistItem[] = [];

export function activate(context: vscode.ExtensionContext): void {
  console.log('[stocksTicker] activate 开始，扩展已加载');
  const store = new WatchlistStore(context.globalState);
  statusBar = new StatusBarController();
  tree = new WatchlistTreeProvider();

  const treeView = vscode.window.createTreeView<TreeNode>('stocksTicker.watchlist', {
    treeDataProvider: tree,
    canSelectMany: false,
  });

  const getConfig = () => {
    const cfg = vscode.workspace.getConfiguration('stocksTicker');
    return {
      on: cfg.get<number>('refreshIntervalMs', 5000),
      off: cfg.get<number>('offHoursRefreshIntervalMs', 30000),
      statusBarEnabled: cfg.get<boolean>('statusBarEnabled', true),
    };
  };

  const syncWatchlistToTree = async () => {
    const list = await store.getAll();
    currentWatchlist = list;
    tree?.setWatchlist(list);
    void vscode.commands.executeCommand('setContext', 'stocksTicker.watchlistEmpty', list.length === 0);
    poller?.refreshNow();
  };

  /** Find the latest quote for a symbol (from cached latestQuotes). */
  const findQuote = (raw: string): Quote | undefined => latestQuotes.find((q) => q.symbol.raw === raw);

  /** Centralize status-bar lock state: updates status bar, tree badge, and context key for menus. */
  const setStatusBarLocked = (raw: string | undefined): void => {
    if (raw) {
      statusBar?.lock(raw);
    } else {
      statusBar?.unlock();
    }
    tree?.setLocked(raw);
    void vscode.commands.executeCommand('setContext', 'stocksTicker.isLocked', !!raw);
  };

  poller = new Poller(store, {
    onQuotes: (quotes) => {
      latestQuotes = quotes;
      // If status bar is locked but the locked stock was removed, clear the lock
      // so the poller doesn't keep showing a stale entry.
      const lockedRaw = statusBar?.getLockedRaw();
      if (lockedRaw && !quotes.some((q) => q.symbol.raw === lockedRaw)) {
        setStatusBarLocked(undefined);
      }
      // Status bar only rotates stocks explicitly in the rotation pool.
      // Sidebar shows quotes for ALL watchlist entries.
      const rotationQuotes = quotes.filter((q) => {
        const item = currentWatchlist.find((it) => it.symbol.raw === q.symbol.raw);
        return item?.inRotation === true;
      });
      statusBar?.update(rotationQuotes);
      tree?.setQuotes(quotes);
    },
    onError: (msg) => statusBar?.setError(msg),
  }, getConfig);

  // Initial sync + start polling.
  void syncWatchlistToTree().then(() => poller?.start());

  // Apply status-bar visibility from config.
  statusBar.setEnabled(getConfig().statusBarEnabled);

  // Sidebar selection → status bar follows (lock to the selected stock).
  context.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      const sel = e.selection[0];
      if (!sel || !isStockNode(sel)) {
        return;
      }
      const q = findQuote(sel.symbol.raw);
      if (q) {
        // Follow selection: lock status bar to this stock temporarily.
        statusBar?.showSingle(q);
      }
    })
  );

  // Commands.
  context.subscriptions.push(
    vscode.commands.registerCommand('stocksTicker.query', () => void queryCommand({
      add: (s, n) => store.add(s, n).then(() => syncWatchlistToTree()),
      has: (raw) => store.has(raw),
      remove: (raw) => store.remove(raw).then(() => syncWatchlistToTree()),
    })),
    vscode.commands.registerCommand('stocksTicker.addToWatchlist', () => addToWatchlistCommand(store, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.removeFromWatchlist', async (node?: TreeNode) => {
      if (node && isStockNode(node)) {
        const raw = node.symbol.raw;
        await store.remove(raw);
        // If status bar is showing the removed stock, release the lock so it rotates away.
        if (statusBar?.getLockedRaw() === raw) {
          setStatusBarLocked(undefined);
        }
        await syncWatchlistToTree();
        return;
      }
      await removeFromWatchlistCommand(store);
      await syncWatchlistToTree();
    }),
    vscode.commands.registerCommand('stocksTicker.showWatchlist', () => void showWatchlistCommand(latestQuotes)),
    vscode.commands.registerCommand('stocksTicker.toggleStatusBar', () => {
      const enabled = !getConfig().statusBarEnabled;
      void vscode.workspace.getConfiguration('stocksTicker').update('statusBarEnabled', enabled, true);
      statusBar?.setEnabled(enabled);
    }),
    vscode.commands.registerCommand('stocksTicker.refresh', () => poller?.refreshNow()),
    vscode.commands.registerCommand('stocksTicker.rename', (node?: { symbol?: { raw?: string }; label?: string }) => renameCommand(store, node, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.pin', (node?: { symbol?: { raw?: string } }) => pinCommand(store, node, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.unpin', (node?: { symbol?: { raw?: string } }) => unpinCommand(store, node, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.moveUp', (node?: { symbol?: { raw?: string } }) => moveUpCommand(store, node, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.moveDown', (node?: { symbol?: { raw?: string } }) => moveDownCommand(store, node, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.clearAll', () => clearAllCommand(store, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.exportJson', () => void exportJsonCommand(store)),
    vscode.commands.registerCommand('stocksTicker.importJson', () => void importJsonCommand(store, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.joinRotation', (node?: { symbol?: { raw?: string } }) => joinRotationCommand(store, node, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.leaveRotation', (node?: { symbol?: { raw?: string } }) => leaveRotationCommand(store, node, () => void syncWatchlistToTree())),
    vscode.commands.registerCommand('stocksTicker.showDetail', (node?: TreeNode) => {
      if (!node || !isStockNode(node)) {
        return;
      }
      void showDetailCommand(node.symbol, fetchQuote, (q) => {
        statusBar?.showSingle(q);
        setStatusBarLocked(q.symbol.raw);
      });
    }),
    // Right-click → lock this stock to the status bar (stops rotation).
    vscode.commands.registerCommand('stocksTicker.lockStatusBar', async (node?: TreeNode) => {
      if (!node || !isStockNode(node)) {
        return;
      }
      const raw = node.symbol.raw;
      let q: Quote | undefined = findQuote(raw);
      if (!q) {
        // Not in cache yet — fetch on demand.
        q = (await fetchQuote(node.symbol)) ?? undefined;
      }
      if (!q) {
        vscode.window.showWarningMessage('未获取到该股票行情，无法锁定。');
        return;
      }
      statusBar?.showSingle(q);
      setStatusBarLocked(raw);
      vscode.window.showInformationMessage(`已将 ${q.name} 锁定到状态栏。`);
    }),
    // Right-click → release status-bar lock (resume rotation).
    vscode.commands.registerCommand('stocksTicker.unlockStatusBar', () => {
      if (!statusBar?.isLocked()) {
        return;
      }
      setStatusBarLocked(undefined);
      statusBar?.update(latestQuotes);
      vscode.window.showInformationMessage('状态栏已恢复轮播。');
    }),
    vscode.commands.registerCommand('stocksTicker.toggleLock', () => {
      if (!statusBar) {
        return;
      }
      if (statusBar.isLocked()) {
        setStatusBarLocked(undefined);
        statusBar.update(latestQuotes);
        vscode.window.showInformationMessage('状态栏已恢复轮播。');
      } else {
        // Lock to the currently shown stock (first of latestQuotes if none shown).
        const current = latestQuotes[0];
        if (current) {
          statusBar.lock(current.symbol.raw);
          statusBar.update(latestQuotes);
          setStatusBarLocked(current.symbol.raw);
          vscode.window.showInformationMessage(`已锁定 ${current.name}。`);
        }
      }
    }),
    treeView,
    statusBar
  );

  // React to config changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('stocksTicker')) {
        const cfg = getConfig();
        statusBar?.setEnabled(cfg.statusBarEnabled);
        poller?.stop();
        poller?.start();
      }
    })
  );
}

export function deactivate(): void {
  poller?.stop();
  statusBar?.dispose();
}
