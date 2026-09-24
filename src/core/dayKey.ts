/**
 * Day keys are local-date strings (YYYY-MM-DD) where a "day" starts at the
 * configurable rollover hour instead of midnight. With rolloverHour = 4,
 * 2:30 AM on Sept 24 still belongs to "2026-09-23".
 *
 * Pure module: no chrome APIs, safe to unit test.
 */

export type DayKey = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, '0');

function formatLocal(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Day key for a timestamp, in the runtime's local timezone. */
export function toDayKey(timestampMs: number, rolloverHour: number): DayKey {
  const d = new Date(timestampMs);
  // Move back a calendar day (not 24h of ms) so DST transitions don't skew it.
  if (d.getHours() < rolloverHour) d.setDate(d.getDate() - 1);
  return formatLocal(d);
}

/** Shift a day key by n calendar days. Uses UTC math on the date itself, so no DST issues. */
export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Whole calendar days from a to b (positive if b is later). */
export function daysBetween(a: DayKey, b: DayKey): number {
  const toUtc = (k: DayKey) => {
    const [y, m, d] = k.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Timestamp of the next rollover boundary strictly after `nowMs` (for chrome.alarms). */
export function nextRolloverAt(nowMs: number, rolloverHour: number): number {
  const d = new Date(nowMs);
  d.setHours(rolloverHour, 0, 0, 0);
  if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}
