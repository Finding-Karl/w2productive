import { addDays, type DayKey } from './dayKey';

export type LeaderboardWindow = 'day' | 'week' | 'month' | 'all';

/** 0 = Monday … 6 = Sunday. Pure date math on the key, so no timezone involved. */
export function weekdayIndex(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Inclusive day_key range for a leaderboard window, from the viewer's "today"
 * (which already honours their rollover hour). null = unbounded.
 */
export function windowRange(w: LeaderboardWindow, today: DayKey): { from: DayKey | null; to: DayKey | null } {
  switch (w) {
    case 'day':
      return { from: today, to: today };
    case 'week': // resets Monday
      return { from: addDays(today, -weekdayIndex(today)), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'all':
      return { from: null, to: null };
  }
}
