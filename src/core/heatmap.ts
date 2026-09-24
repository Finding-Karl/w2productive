import { addDays, type DayKey } from './dayKey';
import type { SessionRecord } from './session';
import { weekdayIndex } from './windows';

export interface DayTotal {
  focusSeconds: number;
  sessions: number;
}

export function dailyTotals(records: readonly Pick<SessionRecord, 'dayKey' | 'focusedSeconds'>[]): Map<DayKey, DayTotal> {
  const out = new Map<DayKey, DayTotal>();
  for (const r of records) {
    const t = out.get(r.dayKey) ?? { focusSeconds: 0, sessions: 0 };
    t.focusSeconds += r.focusedSeconds;
    t.sessions += 1;
    out.set(r.dayKey, t);
  }
  return out;
}

/**
 * GitHub-style grid: `weeks` columns of 7 days (Monday first, matching the leaderboard
 * week). The last column contains `end`; cells after `end` are null.
 */
export function calendarWeeks(end: DayKey, weeks = 53): (DayKey | null)[][] {
  const lastMonday = addDays(end, -weekdayIndex(end));
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const key = addDays(firstMonday, w * 7 + d);
      return key > end ? null : key;
    }),
  );
}

/** Colour bucket. Fixed thresholds (not quartiles) so a level means the same thing for everyone. */
export const LEVEL_THRESHOLDS = [0, 30 * 60, 60 * 60, 2 * 60 * 60] as const; // >0, ≥30m, ≥1h, ≥2h
export function level(focusSeconds: number): 0 | 1 | 2 | 3 | 4 {
  if (focusSeconds <= 0) return 0;
  if (focusSeconds < LEVEL_THRESHOLDS[1]) return 1;
  if (focusSeconds < LEVEL_THRESHOLDS[2]) return 2;
  if (focusSeconds < LEVEL_THRESHOLDS[3]) return 3;
  return 4;
}

export interface ProfileStats {
  totalSeconds: number;
  activeDays: number;
  /** Consecutive focus days ending today — or yesterday, so an unstarted today doesn't zero it. */
  currentStreak: number;
  longestStreak: number;
  bestDay: { key: DayKey; focusSeconds: number } | null;
}

/** Stats over [from, to]. */
export function profileStats(totals: Map<DayKey, DayTotal>, from: DayKey, to: DayKey): ProfileStats {
  let totalSeconds = 0;
  let activeDays = 0;
  let longest = 0;
  let run = 0;
  let bestDay: ProfileStats['bestDay'] = null;
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const s = totals.get(k)?.focusSeconds ?? 0;
    if (s > 0) {
      totalSeconds += s;
      activeDays += 1;
      run += 1;
      longest = Math.max(longest, run);
      if (!bestDay || s > bestDay.focusSeconds) bestDay = { key: k, focusSeconds: s };
    } else {
      run = 0;
    }
  }
  const active = (k: DayKey) => (totals.get(k)?.focusSeconds ?? 0) > 0;
  let current = 0;
  let k = active(to) ? to : addDays(to, -1);
  while (k >= from && active(k)) {
    current += 1;
    k = addDays(k, -1);
  }
  return { totalSeconds, activeDays, currentStreak: current, longestStreak: longest, bestDay };
}
