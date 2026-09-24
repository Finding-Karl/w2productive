import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, nextRolloverAt, toDayKey } from './dayKey';

const local = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();

describe('toDayKey', () => {
  it('uses the calendar date after the rollover hour', () => {
    expect(toDayKey(local(2026, 9, 24, 9), 4)).toBe('2026-09-24');
  });
  it('counts pre-rollover hours as the previous day', () => {
    expect(toDayKey(local(2026, 9, 24, 2, 30), 4)).toBe('2026-09-23');
  });
  it('crosses month and year boundaries', () => {
    expect(toDayKey(local(2027, 1, 1, 1), 4)).toBe('2026-12-31');
  });
  it('rolloverHour 0 behaves like midnight', () => {
    expect(toDayKey(local(2026, 9, 24, 0, 5), 0)).toBe('2026-09-24');
  });
});

describe('addDays / daysBetween', () => {
  it('handles month ends and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('nextRolloverAt', () => {
  it('returns today at the rollover hour if still ahead', () => {
    expect(nextRolloverAt(local(2026, 9, 24, 2), 4)).toBe(local(2026, 9, 24, 4));
  });
  it('returns tomorrow if already past', () => {
    expect(nextRolloverAt(local(2026, 9, 24, 4), 4)).toBe(local(2026, 9, 25, 4));
  });
});
