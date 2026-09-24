import type { CreditEvent, CreditEventKind } from './ledger';
import type { SessionOutcome, SessionRecord } from './session';

/** Row shapes of the Supabase tables (see supabase/migrations). snake_case, ISO timestamps. */
export interface CreditEventRow {
  id: string;
  kind: CreditEventKind;
  amount_seconds: number;
  occurred_at: string;
  session_id: string | null;
  device_id: string | null;
  created_at?: string; // server-assigned
}

export interface FocusSessionRow {
  id: string;
  day_key: string;
  started_at: string;
  ended_at: string;
  planned_minutes: number;
  focused_seconds: number;
  outcome: SessionOutcome;
  credit_earned_seconds: number;
  block_hits: number;
  hardcore: boolean;
  updated_at: string;
  created_at?: string; // server-assigned
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string) => Date.parse(s);

export function toCreditEventRow(e: CreditEvent): CreditEventRow {
  return {
    id: e.id,
    kind: e.kind,
    amount_seconds: e.amountSeconds,
    occurred_at: iso(e.occurredAt),
    session_id: e.sessionId ?? null,
    device_id: e.deviceId,
  };
}

export function fromCreditEventRow(r: CreditEventRow): CreditEvent {
  return {
    id: r.id,
    kind: r.kind,
    amountSeconds: r.amount_seconds,
    occurredAt: ms(r.occurred_at),
    ...(r.session_id ? { sessionId: r.session_id } : {}),
    deviceId: r.device_id ?? 'unknown',
  };
}

export function toFocusSessionRow(s: SessionRecord): FocusSessionRow {
  return {
    id: s.id,
    day_key: s.dayKey,
    started_at: iso(s.startedAt),
    ended_at: iso(s.endedAt),
    planned_minutes: s.plannedMinutes,
    focused_seconds: s.focusedSeconds,
    outcome: s.outcome,
    credit_earned_seconds: s.creditEarnedSeconds,
    block_hits: s.blockHits,
    hardcore: false, // hardcore mode not built yet
    updated_at: iso(s.updatedAt),
  };
}

export function fromFocusSessionRow(r: FocusSessionRow): SessionRecord {
  return {
    id: r.id,
    dayKey: r.day_key,
    startedAt: ms(r.started_at),
    endedAt: ms(r.ended_at),
    plannedMinutes: r.planned_minutes,
    focusedSeconds: r.focused_seconds,
    outcome: r.outcome,
    creditEarnedSeconds: r.credit_earned_seconds,
    blockHits: r.block_hits,
    updatedAt: ms(r.updated_at),
  };
}

/**
 * Where the next pull should start. created_at is the server's transaction start time, so
 * a slow transaction can commit a row "in the past"; re-reading a small overlap window and
 * de-duping by id covers that.
 */
export const PULL_OVERLAP_MS = 60_000;
export function pullSince(cursor: string | null): string {
  return cursor ? iso(ms(cursor) - PULL_OVERLAP_MS) : iso(0);
}
export function maxCreatedAt(rows: { created_at?: string }[], cursor: string | null): string | null {
  return rows.reduce<string | null>(
    (max, r) => (r.created_at && (!max || ms(r.created_at) > ms(max)) ? r.created_at : max),
    cursor,
  );
}
