/** Trading-hours awareness for HK and US markets. */

import type { Market } from '../types/stock';

export type SessionKind = 'hk' | 'us' | 'closed';

export interface SessionInfo {
  kind: SessionKind;
  /** True when any supported market is currently in its trading or extended session. */
  open: boolean;
}

/**
 * Determine whether at least one market is currently in session.
 * Uses UTC to avoid local-TZ pitfalls; DST for US is approximated by month.
 *
 * HK (HKT = UTC+8, no DST):
 *   - Pre-open auction: 09:00-09:30
 *   - Morning: 09:30-12:00
 *   - Afternoon: 13:00-16:00
 *   - Closing auction: 16:00-16:10
 *
 * US (ET, DST approximated):
 *   - Pre-market: 04:00-09:30
 *   - Regular: 09:30-16:00
 *   - After-hours: 16:00-20:00
 */
export function currentSession(now: Date = new Date()): SessionInfo {
  const day = now.getUTCDay();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) {
    return { kind: 'closed', open: false };
  }
  if (isMarketOpen('hk', now)) {
    return { kind: 'hk', open: true };
  }
  if (isMarketOpen('us', now)) {
    return { kind: 'us', open: true };
  }
  return { kind: 'closed', open: false };
}

/**
 * Is a specific market currently in session (trading or extended)?
 * Weekends are always closed for both markets.
 *
 * HK (HKT = UTC+8, no DST):
 *   - Pre-open auction: 09:00-09:30
 *   - Morning: 09:30-12:00
 *   - Afternoon: 13:00-16:00
 *   - Closing auction: 16:00-16:10
 *
 * US (ET, DST approximated):
 *   - Pre-market: 04:00-09:30
 *   - Regular: 09:30-16:00
 *   - After-hours: 16:00-20:00
 */
export function isMarketOpen(market: Market, now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  if (day < 1 || day > 5) {
    return false; // weekend
  }
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  if (market === 'hk') {
    // HKT = UTC+8, no DST.
    // Pre-open 09:00-09:30 HKT → 01:00-01:30 UTC
    // Morning 09:30-12:00 HKT → 01:30-04:00 UTC
    // Afternoon 13:00-16:00 HKT → 05:00-08:00 UTC
    // Closing auction 16:00-16:10 HKT → 08:00-08:10 UTC
    const hkPreOpen = 9 * 60 - 8 * 60; // 01:00 UTC
    const hkMorningClose = 12 * 60 - 8 * 60; // 04:00 UTC
    const hkAfternoonOpen = 13 * 60 - 8 * 60; // 05:00 UTC
    const hkClosingClose = (16 * 60 + 10) - 8 * 60; // 08:10 UTC
    return (utcMinutes >= hkPreOpen && utcMinutes < hkMorningClose) ||
      (utcMinutes >= hkAfternoonOpen && utcMinutes < hkClosingClose);
  }

  // US: approximate DST via month/day.
  const month = now.getUTCMonth() + 1; // 1-12
  const date = now.getUTCDate();
  let usOffset = -5; // EST
  // DST: 2nd Sunday of Mar -> 1st Sunday of Nov
  const secondSunMar = 8 + ((7 - new Date(Date.UTC(now.getUTCFullYear(), 2, 1)).getUTCDay()) % 7);
  const firstSunNov = 1 + ((7 - new Date(Date.UTC(now.getUTCFullYear(), 10, 1)).getUTCDay()) % 7);
  const inDST =
    (month > 3 && month < 11) ||
    (month === 3 && date >= secondSunMar) ||
    (month === 11 && date < firstSunNov);
  if (inDST) {
    usOffset = -4;
  }
  // ET local minutes (ET = UTC + usOffset, usOffset negative).
  const usEtMinutes = (utcMinutes + usOffset * 60 + 24 * 60) % (24 * 60);
  // Pre-market 04:00-09:30 ET, regular 09:30-16:00 ET, after-hours 16:00-20:00 ET.
  const usPreOpen = 4 * 60; // 04:00 ET
  const usAfterHoursClose = 20 * 60; // 20:00 ET
  return usEtMinutes >= usPreOpen && usEtMinutes < usAfterHoursClose;
}
