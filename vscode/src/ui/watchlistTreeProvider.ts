import * as vscode from 'vscode';
import * as path from 'path';
import { formatChangePct, formatMarketTag, formatPrice, isUp } from '../utils/format';
import type { Market, Quote, WatchlistItem } from '../types/stock';

/** Resolve a media icon path to a vscode-ready URI. */
function mediaIcon(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', 'media', name));
}

/**
 * TreeDataProvider backing the sidebar Watchlist view.
 *
 * Two-level tree:
 *   - Root: one GroupNode per market (HK / US), with summary in description.
 *   - Children: one StockNode per watched stock, with live price + change.
 *
 * contextValue taxonomy (drives menu visibility):
 *   - group            : market group header (no inline actions)
 *   - stockPinned      : pinned + has quote
 *   - stockWithQuote   : has quote
 *   - stockNoQuote     : no quote yet
 *   - stockPinnedNoQuote: pinned but no quote
 */
export class WatchlistTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private watchlist: WatchlistItem[] = [];
  private quotes = new Map<string, Quote>();
  private lockedRaw: string | undefined;

  setWatchlist(items: WatchlistItem[]): void {
    this.watchlist = items;
    this._onDidChange.fire(undefined);
  }

  setQuotes(quotes: Quote[]): void {
    this.quotes.clear();
    for (const q of quotes) {
      this.quotes.set(q.symbol.raw, q);
    }
    this._onDidChange.fire(undefined);
  }

  setLocked(raw: string | undefined): void {
    this.lockedRaw = raw;
    this._onDidChange.fire(undefined);
  }

  findItem(raw: string): WatchlistItem | undefined {
    return this.watchlist.find((it) => it.symbol.raw === raw);
  }

  findQuote(raw: string): Quote | undefined {
    return this.quotes.get(raw);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.buildGroupNodes();
    }
    if (element instanceof GroupNode) {
      return this.watchlist
        .filter((it) => it.symbol.market === element.market)
        .map((it) => this.buildStockNode(it));
    }
    return [];
  }

  /** Build the two market group headers with summary info. */
  private buildGroupNodes(): GroupNode[] {
    const markets: Market[] = ['hk', 'us'];
    const present = markets.filter((m) => this.watchlist.some((it) => it.symbol.market === m));
    if (present.length === 0) {
      return [
        Object.assign(new GroupNode('hk', '自选股为空', vscode.TreeItemCollapsibleState.None), {
          tooltip: '运行「股票行情: 添加到自选股」命令添加一只股票。',
        }) as GroupNode,
      ];
    }
    return present.map((m) => {
      const items = this.watchlist.filter((it) => it.symbol.market === m);
      const quotes = items
        .map((it) => this.quotes.get(it.symbol.raw))
        .filter((q): q is Quote => !!q);
      const upCount = quotes.filter((q) => q.price > q.prevClose).length;
      const downCount = quotes.filter((q) => q.price < q.prevClose).length;
      const flatCount = quotes.length - upCount - downCount;
      // Compute average change pct for the group.
      const avgPct = quotes.length > 0
        ? quotes.reduce((s, q) => s + ((q.price - q.prevClose) / q.prevClose) * 100, 0) / quotes.length
        : 0;
      const avgStr = quotes.length > 0 ? `  均${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(2)}%` : '';
      const node = new GroupNode(
        m,
        `${this.marketLabel(m)} (${items.length})  ▲${upCount} ▼${downCount}${flatCount > 0 ? ` —${flatCount}` : ''}${avgStr}`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      node.tooltip = `${this.marketLabel(m)} · 均${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(2)}%`;
      node.contextValue = 'group';
      return node;
    });
  }

  private marketLabel(m: Market): string {
    return m === 'hk' ? '港股' : '美股';
  }

  private buildStockNode(it: WatchlistItem): StockNode {
    const q = this.quotes.get(it.symbol.raw);
    const pinned = it.pinned === true;
    const inRot = it.inRotation === true;
    const locked = this.lockedRaw === it.symbol.raw;
    const lockTag = locked ? ' 🔒' : '';
    // Visual marker: stocks in the rotation pool get a ⊙ suffix so users can
    // see at a glance which stocks will appear in the status bar.
    const rotTag = inRot ? ' ⊙' : '';
    const node = new StockNode(
      `${it.name}${rotTag}${lockTag}`,
      it.symbol,
      it.pinned,
      vscode.TreeItemCollapsibleState.None
    );
    // contextValue: in-rotation items get a `-rot` suffix so menu `when`
    // conditions can distinguish them. Existing conditions (which use
    // unanchored regex like /^stockPinned/) still match both variants.
    const rotSuffix = inRot ? '-rot' : '';
    if (q) {
      const up = isUp(q);
      const flat = q.price === q.prevClose;
      node.iconPath = mediaIcon(up ? (flat ? 'flat.svg' : 'up.svg') : 'down.svg');
      const arrow = up ? (flat ? '—' : '▲') : '▼';
      const extTag = q.isExtended === 'pre' ? ' 盘前' : q.isExtended === 'post' ? ' 盘后' : '';
      node.description = `${formatPrice(q)} ${arrow} ${formatChangePct(q)}${extTag}`;
      const lines = [`昨收 ${q.prevClose} · 开盘 ${q.open} · 量 ${q.volume}`];
      if (q.regularPrice != null && q.regularPrice !== q.price) {
        lines.push(`常规时段价 ${q.regularPrice}`);
      }
      if (q.timestamp) {
        lines.push(q.timestamp);
      }
      node.tooltip = `${q.symbol.code}${extTag ? ' · ' + extTag.trim() : ''}${inRot ? ' · 轮播中' : ''}\n${lines.join('\n')}`;
      node.contextValue = (pinned ? 'stockPinned' : 'stockWithQuote') + rotSuffix;
    } else {
      node.iconPath = mediaIcon('flat.svg');
      node.description = `${formatMarketTag(it.symbol.market)} ${it.symbol.code}`;
      node.tooltip = `${it.name} — 等待行情数据…${inRot ? '（轮播中）' : ''}`;
      node.contextValue = (pinned ? 'stockPinnedNoQuote' : 'stockNoQuote') + rotSuffix;
    }
    return node;
  }
}

/** Base tree node. */
export class TreeNode extends vscode.TreeItem {}

/** Market group header (HK / US). */
export class GroupNode extends TreeNode {
  constructor(
    public readonly market: Market,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.id = `group-${market}`;
  }
}

/** Stock leaf node. */
export class StockNode extends TreeNode {
  constructor(
    label: string,
    public readonly symbol: WatchlistItem['symbol'],
    public readonly pinned: boolean | undefined,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

/** Type guard: is this node a StockNode? */
export function isStockNode(node: TreeNode | undefined): node is StockNode {
  return !!node && node instanceof StockNode;
}
