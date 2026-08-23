import type { Market, StockSymbol } from '../types/stock';

/**
 * Resolve loose user input into a StockSymbol.
 *
 * Rules (HK + US only):
 * - Already-prefixed: "hk00700", "usAAPL" → as-is (case-normalized).
 * - Pure digits, length 4-6 → HK stock, prefix "hk". HK codes are zero-padded
 *   to 5 digits (Tencent convention), e.g. "0700" → "hk00700".
 * - Pure letters, length 1-6 → US stock, prefix "us".
 * - "AAPL" / "00700" → inferred by shape.
 */
export function resolveSymbol(input: string): StockSymbol | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('hk')) {
    const digits = trimmed.slice(2);
    if (!digits) {
      return null;
    }
    const code = digits.padStart(5, '0');
    return { raw: `hk${code}`, market: 'hk', code };
  }
  if (lower.startsWith('us')) {
    const code = trimmed.slice(2);
    return code ? { raw: `us${code.toUpperCase()}`, market: 'us', code: code.toUpperCase() } : null;
  }

  if (/^\d{4,6}$/.test(trimmed)) {
    const code = trimmed.padStart(5, '0');
    return { raw: `hk${code}`, market: 'hk', code };
  }
  if (/^[A-Za-z]{1,6}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return { raw: `us${upper}`, market: 'us', code: upper };
  }
  return null;
}

export function formatMarket(market: Market): string {
  return market === 'hk' ? 'HK' : 'US';
}
