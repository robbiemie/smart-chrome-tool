import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { WatchlistStore } from './storage/watchlistStore';
import { AlertStore } from './storage/alertStore';
import { StatusBarController } from './ui/statusBar';
import { WatchlistTreeProvider, TreeNode, isStockNode } from './ui/watchlistTreeProvider';
import { AlertTreeProvider, AlertNode } from './ui/alertTreeProvider';
import { AlertEngine } from './alert/alertEngine';
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
import { addAlertCommand, toggleAlertCommand, removeAlertCommand, clearAlertsCommand } from './commands/alert';
import { fetchQuote } from './providers/tencent';
import type { Quote, StockSymbol, WatchlistItem } from './types/stock';

let statusBar: StatusBarController | undefined;
let tree: WatchlistTreeProvider | undefined;
let alertTree: AlertTreeProvider | undefined;
let poller: Poller | undefined;
let latestQuotes: Quote[] = [];
/** Cached watchlist — used to filter quotes into the rotation subset. */
let currentWatchlist: WatchlistItem[] = [];

/** Check whether a proxy env var is already set (any case). */
function hasProxyEnv(): boolean {
  return !!(process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy);
}

/** Set proxy env vars (both cases) to `url`, if not already set. */
function setProxyEnv(url: string): void {
  if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
    process.env.HTTPS_PROXY = url;
  }
  if (!process.env.HTTP_PROXY && !process.env.http_proxy) {
    process.env.HTTP_PROXY = url;
  }
}

/**
 * Read the macOS system proxy via `scutil --proxy` and return an
 * `http://host:port` URL if HTTPS proxy is enabled, else undefined.
 * Returns undefined on non-macOS or any error.
 */
function detectMacSystemProxy(): string | undefined {
  if (process.platform !== 'darwin') {
    return undefined;
  }
  try {
    const out = execSync('scutil --proxy', { encoding: 'utf8', timeout: 2000 });
    const httpsEnabled = /HTTPSEnable\s*:\s*1/.test(out);
    if (!httpsEnabled) {
      return undefined;
    }
    const host = out.match(/HTTPSProxy\s*:\s*([\d.]+)/)?.[1];
    const port = out.match(/HTTPSPort\s*:\s*(\d+)/)?.[1];
    if (host && port) {
      return `http://${host}:${port}`;
    }
  } catch {
    // scutil not available, timed out, or parse failure — give up silently.
  }
  return undefined;
}

/**
 * Spawn a login shell to read proxy env vars from the user's shell config
 * (e.g. ~/.zshrc sets `https_proxy`). VSCode launched from the Dock does not
 * inherit shell env vars, so this is the only way to pick up a proxy that the
 * user configured only in their dotfiles. Returns the proxy URL or undefined.
 */
function detectShellProxy(): string | undefined {
  const shell = process.env.SHELL || '/bin/zsh';
  try {
    // `-i` = interactive shell to source ~/.zshrc / ~/.bashrc;
    // print both vars, take the first non-empty http:// or https:// value.
    const out = execSync(
      `${shell} -i -c 'echo "HTTPS_PROXY=$HTTPS_PROXY"; echo "https_proxy=$https_proxy"; echo "HTTP_PROXY=$HTTP_PROXY"; echo "http_proxy=$http_proxy"' 2>/dev/null`,
      { encoding: 'utf8', timeout: 4000 }
    );
    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq < 0) {
        continue;
      }
      const val = line.slice(eq + 1).trim();
      if (/^https?:\/\/.+/.test(val)) {
        return val;
      }
    }
  } catch {
    // Shell not available, timed out, or config error — give up silently.
  }
  return undefined;
}

/**
 * Detect proxy from multiple sources and inject into process.env so the Yahoo
 * provider (which reads env vars) can route through it. Logs the result for
 * diagnostics.
 */
function detectAndSetProxy(): void {
  // 1. Already in env (shell-inherited) — nothing to do.
  if (hasProxyEnv()) {
    console.log('[stocksTicker] proxy: env (', getProxyEnvValue(), ')');
    return;
  }
  // 2. VSCode's http.proxy setting.
  const httpProxy = vscode.workspace.getConfiguration('http').get<string>('proxy');
  if (httpProxy) {
    setProxyEnv(httpProxy);
    console.log('[stocksTicker] proxy: VSCode http.proxy setting (', httpProxy, ')');
    return;
  }
  // 3. macOS system proxy (scutil — System Preferences / Clash "system proxy").
  const sysProxy = detectMacSystemProxy();
  if (sysProxy) {
    setProxyEnv(sysProxy);
    console.log('[stocksTicker] proxy: macOS system (', sysProxy, ')');
    return;
  }
  // 4. Shell dotfiles (e.g. ~/.zshrc sets https_proxy). VSCode from Dock
  //    doesn't inherit shell env, so we spawn a login shell to read it.
  const shellProxy = detectShellProxy();
  if (shellProxy) {
    setProxyEnv(shellProxy);
    console.log('[stocksTicker] proxy: shell dotfiles (', shellProxy, ')');
    return;
  }
  console.log('[stocksTicker] proxy: none detected — Yahoo extended-hours will fail in mainland China. Set http.proxy in VSCode settings or https_proxy in shell.');
}

function getProxyEnvValue(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy || undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[stocksTicker] activate 开始，扩展已加载');

  // ---- Proxy detection ----
  // Yahoo (extended-hours data) needs a proxy in mainland China. VSCode
  // launched from the Dock/Spotlight does NOT inherit shell env vars
  // (e.g. `https_proxy` set in ~/.zshrc), so we probe multiple sources:
  //   1. Existing process.env (shell-inherited, if launched from terminal)
  //   2. VSCode's `http.proxy` setting
  //   3. macOS system proxy via `scutil --proxy` (System Preferences / Clash / Surge)
  // We only set env when not already present so an explicit value wins.
  detectAndSetProxy();

  const store = new WatchlistStore(context.globalState);
  const alertStore = new AlertStore(context.globalState);
  statusBar = new StatusBarController();
  tree = new WatchlistTreeProvider();
  alertTree = new AlertTreeProvider();

  const treeView = vscode.window.createTreeView<TreeNode>('stocksTicker.watchlist', {
    treeDataProvider: tree,
    canSelectMany: false,
  });

  const alertView = vscode.window.createTreeView<AlertNode>('stocksTicker.alerts', {
    treeDataProvider: alertTree,
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

  /** Reload alerts from storage into the alert tree + update empty-state context. */
  const syncAlertsToTree = async () => {
    const list = await alertStore.getAll();
    alertTree?.setAlerts(list);
    void vscode.commands.executeCommand('setContext', 'stocksTicker.alertsEmpty', list.length === 0);
  };

  /** Find the latest quote for a symbol (from cached latestQuotes). */
  const findQuote = (raw: string): Quote | undefined => latestQuotes.find((q) => q.symbol.raw === raw);

  // Alert engine: declared before the poller so the onQuotes closure can reference
  // it. Edge-triggered evaluation; refreshes the alert tree on state changes and
  // peeks the status bar when the user clicks「查看」on a fired toast.
  const alertEngine = new AlertEngine(alertStore, {
    onChanged: () => void syncAlertsToTree(),
    onFollow: (q) => statusBar?.showSingle(q),
  });

  poller = new Poller(store, {
    onQuotes: (quotes) => {
      latestQuotes = quotes;
      // Status bar only rotates stocks explicitly in the rotation pool.
      // Sidebar shows quotes for ALL watchlist entries.
      const rotationQuotes = quotes.filter((q) => {
        const item = currentWatchlist.find((it) => it.symbol.raw === q.symbol.raw);
        return item?.inRotation === true;
      });
      statusBar?.update(rotationQuotes);
      tree?.setQuotes(quotes);
      // Feed live prices to the alert tree (shows current price next to target).
      alertTree?.setQuotes(quotes);
      // Evaluate price alerts against the fresh quotes (fires toasts if triggered).
      void alertEngine.evaluate(quotes);
    },
    onError: (msg) => statusBar?.setError(msg),
  }, getConfig);

  // Initial sync + start polling.
  void syncWatchlistToTree().then(() => poller?.start());
  // Load existing alerts into the tree + set empty-state context.
  void syncAlertsToTree();

  // Apply status-bar visibility from config.
  statusBar.setEnabled(getConfig().statusBarEnabled);

  // Sidebar selection → status bar peeks the selected stock (next poll resumes rotation).
  context.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      const sel = e.selection[0];
      if (!sel || !isStockNode(sel)) {
        return;
      }
      const q = findQuote(sel.symbol.raw);
      if (q) {
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
        await store.remove(node.symbol.raw);
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
      });
    }),
    // ---- Price alerts ----
    // Add an alert. From the alert view title → pick a stock from the watchlist;
    // from a watchlist stock's context menu → that stock is preselected.
    vscode.commands.registerCommand('stocksTicker.addAlert', (node?: { symbol?: StockSymbol; label?: string }) =>
      void addAlertCommand(alertStore, () => currentWatchlist, node, () => void syncAlertsToTree())
    ),
    vscode.commands.registerCommand('stocksTicker.toggleAlert', (node?: AlertNode) =>
      void toggleAlertCommand(alertStore, node, () => void syncAlertsToTree())
    ),
    vscode.commands.registerCommand('stocksTicker.removeAlert', (node?: AlertNode) =>
      void removeAlertCommand(alertStore, node, () => void syncAlertsToTree())
    ),
    vscode.commands.registerCommand('stocksTicker.clearAlerts', () =>
      void clearAlertsCommand(alertStore, () => void syncAlertsToTree())
    ),
    treeView,
    alertView,
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
