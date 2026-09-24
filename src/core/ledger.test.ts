import { describe, expect, it } from 'vitest';
import { balanceOf, mergeEvents, sessionEarnEvent, type CreditEvent } from './ledger';
import { finishSession, startSession } from './session';

const ev = (id: string, amount: number, at: number): CreditEvent => ({
  id, kind: amount >= 0 ? 'session_earn' : 'spend', amountSeconds: amount, occurredAt: at, deviceId: 'd',
});

describe('ledger', () => {
  it('balance is the sum of signed events', () => {
    expect(balanceOf([ev('a', 1200, 1), ev('b', -300, 2)])).toBe(900);
    expect(balanceOf([])).toBe(0);
  });

  it('merging is a union by id, so re-pulling the same rows is a no-op', () => {
    const local = [ev('a', 100, 1), ev('b', 50, 3)];
    const remote = [ev('b', 50, 3), ev('c', -20, 2)];
    const merged = mergeEvents(local, remote);
    expect(merged.map((e) => e.id)).toEqual(['a', 'c', 'b']);
    expect(mergeEvents(merged, remote)).toEqual(merged);
    expect(balanceOf(merged)).toBe(130);
  });

  it('sessionEarnEvent: one event per earning session, none for zero credit', () => {
    const rules = { earnMinutesPerHour: 20, minSessionPercent: 50 };
    const s = startSession('s1', 0, 60);
    const full = finishSession(s, s.endsAt, rules, 4);
    expect(sessionEarnEvent(full, 'e1', 'd')).toMatchObject({ amountSeconds: 1200, sessionId: 's1' });
    const early = finishSession(s, 60_000, rules, 4);
    expect(sessionEarnEvent(early, 'e2', 'd')).toBeNull();
  });
});
