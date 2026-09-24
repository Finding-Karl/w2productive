import { describe, expect, it } from 'vitest';
import { calendarWeeks, dailyTotals, level, profileStats } from './heatmap';
import { weekdayIndex, windowRange } from './windows';

describe('windowRange', () => {
  // 2026-09-24 is a Thursday
  it('day / week (Monday start) / month / all', () => {
    expect(windowRange('day', '2026-09-24')).toEqual({ from: '2026-09-24', to: '2026-09-24' });
    expect(windowRange('week', '2026-09-24')).toEqual({ from: '2026-09-21', to: '2026-09-24' });
    expect(windowRange('week', '2026-09-21')).toEqual({ from: '2026-09-21', to: '2026-09-21' });
    expect(windowRange('week', '2026-09-27')).toEqual({ from: '2026-09-21', to: '2026-09-27' }); // Sunday
    expect(windowRange('month', '2026-09-24')).toEqual({ from: '2026-09-01', to: '2026-09-24' });
    expect(windowRange('all', '2026-09-24')).toEqual({ from: null, to: null });
  });
  it('weekdayIndex is Monday-based', () => {
    expect(weekdayIndex('2026-09-21')).toBe(0);
    expect(weekdayIndex('2026-09-27')).toBe(6);
  });
});

describe('calendarWeeks', () => {
  const weeks = calendarWeeks('2026-09-24');
  it('53 Monday-first columns ending in the week of `end`', () => {
    expect(weeks).toHaveLength(53);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const last = weeks[52]!;
    expect(last[0]).toBe('2026-09-21');
    expect(last[3]).toBe('2026-09-24');
    expect(last[4]).toBeNull(); // Friday: future
    expect(weeks[0]![0]).toBe('2025-09-22');
  });
});

describe('level', () => {
  it('buckets by fixed thresholds', () => {
    expect([0, 60, 1800, 3600, 7199, 7200, 20000].map(level)).toEqual([0, 1, 2, 3, 3, 4, 4]);
  });
});

describe('profileStats', () => {
  const t = dailyTotals([
    { dayKey: '2026-09-20', focusedSeconds: 600 },
    { dayKey: '2026-09-21', focusedSeconds: 1800 },
    { dayKey: '2026-09-22', focusedSeconds: 3600 },
    { dayKey: '2026-09-22', focusedSeconds: 3600 },
    { dayKey: '2026-09-23', focusedSeconds: 60 },
    { dayKey: '2026-09-10', focusedSeconds: 60 },
  ]);
  it('aggregates totals, active days, streaks and best day', () => {
    const s = profileStats(t, '2025-09-24', '2026-09-24');
    expect(s.totalSeconds).toBe(600 + 1800 + 7200 + 60 + 60);
    expect(s.activeDays).toBe(5);
    expect(s.longestStreak).toBe(4);
    expect(s.currentStreak).toBe(4); // today (24th) empty -> counts back from yesterday
    expect(s.bestDay).toEqual({ key: '2026-09-22', focusSeconds: 7200 });
    expect(t.get('2026-09-22')!.sessions).toBe(2);
  });
  it('current streak breaks on a gap before yesterday', () => {
    expect(profileStats(t, '2025-09-24', '2026-09-26').currentStreak).toBe(0);
  });
});
