import type { SessionRecord } from './session';

/**
 * Credit is an append-only ledger of signed events; the balance is their sum.
 * Events carry client-generated UUIDs, so merging copies from several devices is a
 * plain union by id — no conflict resolution needed.
 */
export type CreditEventKind =
  | 'session_earn'
  | 'spend'
  | 'break_glass'
  | 'vault_deposit'
  | 'vault_withdraw'
  | 'adjust';

export interface CreditEvent {
  id: string;
  kind: CreditEventKind;
  amountSeconds: number; // signed: earn > 0, spend < 0
  occurredAt: number; // epoch ms, client clock
  sessionId?: string;
  deviceId: string;
}

export function balanceOf(events: readonly CreditEvent[]): number {
  return events.reduce((sum, e) => sum + e.amountSeconds, 0);
}

/** Union by id (existing copy wins), sorted by occurredAt then id for stable order. */
export function mergeById<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
  orderKey: (t: T) => number,
): T[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => orderKey(a) - orderKey(b) || a.id.localeCompare(b.id));
}

export const mergeEvents = (a: readonly CreditEvent[], b: readonly CreditEvent[]) =>
  mergeById(a, b, (e) => e.occurredAt);

/** The ledger entry for a finished session, or null if it earned nothing. */
export function sessionEarnEvent(
  record: SessionRecord,
  id: string,
  deviceId: string,
): CreditEvent | null {
  if (record.creditEarnedSeconds <= 0) return null;
  return {
    id,
    kind: 'session_earn',
    amountSeconds: record.creditEarnedSeconds,
    occurredAt: record.endedAt,
    sessionId: record.id,
    deviceId,
  };
}
