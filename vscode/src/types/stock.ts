export type Market = 'hk' | 'us';

export interface StockSymbol {
  /** Full Tencent symbol, e.g. "hk00700", "usAAPL" */
  raw: string;
  market: Market;
  /** Bare code, e.g. "00700", "AAPL" */
  code: string;
}

export interface Quote {
  symbol: StockSymbol;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  volume: number;
  /** ISO date-time from data source */
  timestamp?: string;
  /** Extended-hours (pre/post market) data, currently only from Yahoo for US stocks. */
  preMarketPrice?: number;
  postMarketPrice?: number;
  /** Regular-session last price (excludes pre/post). Set when extended data is available. */
  regularPrice?: number;
  /** Whether `price` is currently an extended-hours price. */
  isExtended?: 'pre' | 'post' | null;
}

export interface WatchlistItem {
  symbol: StockSymbol;
  name: string;
  addedAt: number;
  /** Pinned items float to the top of the watchlist. */
  pinned?: boolean;
  /** Whether this stock participates in status-bar rotation. Default false. */
  inRotation?: boolean;
}
