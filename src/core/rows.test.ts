import { describe, expect, it } from 'vitest';
import type { CreditEvent } from './ledger';
import {
  fromCreditEventRow, fromFocusSessionRow, maxCreatedAt, pullSince,
  toCreditEventRow, toFocusSessionRow,
} from './rows';
import { finishSession, startSession } from './session';

describe('row mapping round-trips', () => {
  it('credit events', () => {
    const e: CreditEvent = { id: 'x', kind: 'spend', amountSeconds: -60, occurredAt: 1_790_000_000_000, deviceId: 'd' };
    expect(fromCreditEventRow(toCreditEventRow(e))).toEqual(e);
    const withSession = { ...e, kind: 'session_earn' as const, amountSeconds: 60, sessionId: 's' };
    expect(fromCreditEventRow(toCreditEventRow(withSession))).toEqual(withSession);
  });

  it('sessions', () => {
    const s = startSession('s1', 1_790_000_000_000, 30);
    const rec = finishSession(s, s.endsAt, { earnMinutesPerHour: 20, minSessionPercent: 50 }, 4);
    expect(fromFocusSessionRow(toFocusSessionRow(rec))).toEqual(rec);
  });
});

describe('pull cursor', () => {
  it('starts from epoch, then overlaps the last cursor by a minute', () => {
    expect(pullSince(null)).toBe('1970-01-01T00:00:00.000Z');
    expect(pullSince('2026-09-24T10:00:00.000Z')).toBe('2026-09-24T09:59:00.000Z');
  });
  it('advances to the newest created_at seen', () => {
    const rows = [{ created_at: '2026-09-24T10:00:00Z' }, { created_at: '2026-09-24T11:00:00Z' }, {}];
    expect(maxCreatedAt(rows, null)).toBe('2026-09-24T11:00:00Z');
    expect(maxCreatedAt([], '2026-01-01T00:00:00Z')).toBe('2026-01-01T00:00:00Z');
  });
});
