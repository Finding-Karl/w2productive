import { describe, expect, it } from 'vitest';
import { creditFor, finishSession, minimumSeconds, startSession } from './session';

const rules = { earnMinutesPerHour: 20, minSessionPercent: 50 };
const T0 = new Date(2026, 8, 23, 10, 0).getTime();
const min = (n: number) => n * 60_000;

describe('startSession', () => {
  it('sets endsAt from the planned length', () => {
    expect(startSession('a', T0, 25).endsAt).toBe(T0 + min(25));
  });
  it('rejects bad lengths', () => {
    expect(() => startSession('a', T0, 0)).toThrow();
    expect(() => startSession('a', T0, 2.5)).toThrow();
  });
});

describe('minimumSeconds', () => {
  it('scales with the planned length', () => {
    expect(minimumSeconds(10, rules)).toBe(300);
    expect(minimumSeconds(60, rules)).toBe(1800);
    expect(minimumSeconds(90, rules)).toBe(2700);
  });
});

describe('creditFor', () => {
  it('earns 20 min per 60 min', () => expect(creditFor(3600, 60, rules)).toBe(1200));
  it('nothing below the minimum for that length', () => {
    expect(creditFor(1799, 60, rules)).toBe(0);
    expect(creditFor(1799, 30, rules)).toBeGreaterThan(0); // same time, shorter session
  });
  it('pro-rata at the minimum', () => expect(creditFor(1800, 60, rules)).toBe(600));
});

describe('finishSession', () => {
  const s = startSession('a', T0, 50);

  it('ended early before endsAt, partial credit', () => {
    const r = finishSession(s, T0 + min(30), rules, 4);
    expect(r.outcome).toBe('ended_early');
    expect(r.focusedSeconds).toBe(1800);
    expect(r.creditEarnedSeconds).toBe(600);
  });

  it('ended early under the minimum (25 of 50 min) earns nothing', () => {
    const r = finishSession(s, T0 + min(24), rules, 4);
    expect(r.outcome).toBe('ended_early');
    expect(r.creditEarnedSeconds).toBe(0);
  });

  it('late alarm counts as completed and is capped at planned length', () => {
    const r = finishSession(s, T0 + min(90), rules, 4);
    expect(r.outcome).toBe('completed');
    expect(r.endedAt).toBe(s.endsAt);
    expect(r.focusedSeconds).toBe(3000);
  });

  it('tags the day using the rollover hour', () => {
    const late = startSession('b', new Date(2026, 8, 24, 2, 0).getTime(), 25);
    expect(finishSession(late, late.endsAt, rules, 4).dayKey).toBe('2026-09-23');
  });
});
