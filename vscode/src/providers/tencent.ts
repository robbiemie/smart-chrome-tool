import * as https from 'https';
import { fetchYahooQuotes } from './yahoo';
import type { Quote, StockSymbol } from '../types/stock';

/**
 * Tencent real-time quote API.
 * Endpoint: https://qt.gtimg.cn/q=<sym1>,<sym2>,...
 * Response: `v_<sym>="100~AAPL~Apple Inc~178.45~...";` fields split by `~`.
 */
const QUOTE_ENDPOINT = 'https://qt.gtimg.cn/q=';

interface ParsedFields {
  name: string;
  price: number;
  prevClose: number;
  open: number;
  volume: number;
  timestamp?: string;
}

function parseQuoteLine(line: string): { raw: string; fields: ParsedFields } | null {
  const match = line.match(/v_(\w+)\s*=\s*"([^"]*)"/);
  if (!match) {
    return null;
  }
  const raw = match[1];
  const body = match[2];
  if (!body) {
    return null;
  }
  const parts = body.split('~');
  // Stable indices in Tencent format:
  // 1 = code, 2 = name, 3 = current price, 4 = prev close, 5 = open, 6 = volume,
  // 30 = date (yyyy-MM-dd), 31 = time (HH:mm:ss)
  const name = parts[2] ?? raw;
  const price = Number(parts[3]);
  const prevClose = Number(parts[4]);
  const open = Number(parts[5]);
  const volume = Number(parts[6]);
  const date = parts[30];
  const time = parts[31];
  if (Number.isNaN(price) && Number.isNaN(prevClose)) {
    return null;
  }
  // During non-trading hours or for delayed HK quotes, Tencent may return
  // price=0 while prevClose holds the last close. Fall back so the UI shows
  // the last known price instead of "no data".
  const effectivePrice = price > 0 ? price : prevClose > 0 ? prevClose : 0;
  if (effectivePrice === 0) {
    return null;
  }
  const timestamp = date && time ? `${date} ${time}` : undefined;
  return { raw, fields: { name, price: effectivePrice, prevClose: prevClose || effectivePrice, open, volume, timestamp } };
}

function splitMarket(raw: string): StockSymbol | null {
  const lower = raw.toLowerCase();
  if (lower.startsWith('hk')) {
    return { raw: lower, market: 'hk', code: raw.slice(2) };
  }
  if (lower.startsWith('us')) {
    // Preserve original case — Tencent quote API is case-sensitive for US symbols (usNVDA, not usnvda).
    return { raw, market: 'us', code: raw.slice(2) };
  }
  return null;
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const directAgent = new https.Agent({ keepAlive: false });
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        agent: directAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Host: urlObj.hostname,
        },
      },
      (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch quotes for multiple symbols in one request.
 * Symbols must be full Tencent form (e.g. hk00700, usAAPL).
 */
export async function fetchQuotes(symbols: StockSymbol[]): Promise<Quote[]> {
  if (symbols.length === 0) {
    return [];
  }
  const url = QUOTE_ENDPOINT + symbols.map((s) => s.raw).join(',');
  let text: string;
  try {
    text = await fetchText(url);
  } catch (err) {
    console.warn('[stocksTicker] quote fetch failed:', url, err);
    return [];
  }
  console.log('[stocksTicker] quote raw (first 200):', text.slice(0, 200));
  const lines = text.split(';').map((l) => l.trim()).filter(Boolean);
  const out: Quote[] = [];
  for (const line of lines) {
    const parsed = parseQuoteLine(line);
    if (!parsed) {
      continue;
    }
    // Debug: dump field layout for HK quotes to diagnose format issues.
    if (parsed.raw.toLowerCase().startsWith('hk')) {
      const fields = line.match(/v_\w+\s*=\s*"([^"]*)"/)?.[1]?.split('~') ?? [];
      console.log(`[stocksTicker] HK ${parsed.raw} fields[0..9]:`, JSON.stringify(fields.slice(0, 10)), `total fields: ${fields.length}`);
    }
    const symbol = splitMarket(parsed.raw);
    if (!symbol) {
      continue;
    }
    out.push({ symbol, ...parsed.fields });
  }

  // Enrich US stocks with Yahoo extended-hours data.
  // Tencent only returns regular-session prices; Yahoo fills pre/post-market
  // prices. Yahoo is unreachable from mainland China without VPN — when it
  // fails we silently keep Tencent's regular-session data (no extended tag).
  const usSymbols = out.filter((q) => q.symbol.market === 'us').map((q) => q.symbol);
  if (usSymbols.length > 0) {
    const yahooMap = await fetchYahooQuotes(usSymbols);
    for (const q of out) {
      const y = yahooMap.get(q.symbol.raw);
      if (!y) {
        continue;
      }
      q.regularPrice = y.regularPrice;
      q.preMarketPrice = y.preMarketPrice;
      q.postMarketPrice = y.postMarketPrice;
      // If Yahoo reports an extended-hours price, use it as the live `price`
      // so the UI shows the most recent traded price (pre/post market).
      if (y.isExtended && Number.isFinite(y.latestPrice)) {
        q.price = y.latestPrice;
        q.isExtended = y.isExtended;
      } else {
        q.isExtended = null;
      }
    }
  }

  console.log('[stocksTicker] quote parsed:', out.length, 'quotes from', symbols.length, 'symbols');
  return out;
}

/** Fetch a single quote. */
export async function fetchQuote(symbol: StockSymbol): Promise<Quote | null> {
  const [q] = await fetchQuotes([symbol]);
  return q ?? null;
}
