import { toDayKey, type DayKey } from './dayKey';
import type { DeepFocusState } from './deepFocus';

export const MIN_SESSION_MINUTES = 1;
export const MAX_SESSION_MINUTES = 240;

export interface ActiveSession {
  id: string;
  startedAt: number; // epoch ms
  endsAt: number; // epoch ms
  plannedMinutes: number;
  /** Times the block page was hit during this session (stat only; doesn't break it). */
  blockHits: number;
  /** Absent on sessions started before session types existed = standard. */
  type?: SessionType;
  deep?: DeepFocusState;
}

export type SessionType = 'standard' | 'deep';
/** Why a session ended. 'missed_check' = deep focus presence check not answered in time. */
export type EndReason = 'completed' | 'stopped' | 'missed_check';

/** completed = ran to endsAt; ended_early = stopped from popup or given up on block page. */
export type SessionOutcome = 'completed' | 'ended_early';

export interface SessionRecord {
  id: string;
  dayKey: DayKey; // day the session started, using the rollover hour
  startedAt: number;
  endedAt: number;
  plannedMinutes: number;
  focusedSeconds: number;
  outcome: SessionOutcome;
  creditEarnedSeconds: number;
  blockHits: number;
  updatedAt: number; // for future sync
  sessionType?: SessionType; // absent = standard (pre-deep-focus records)
  endReason?: EndReason;
}

export interface CreditRules {
  earnMinutesPerHour: number;
  /** % of the planned length that must be focused before ending early earns anything. */
  minSessionPercent: number;
}

/** Focus seconds required before a session of this length earns credit. */
export function minimumSeconds(plannedMinutes: number, rules: CreditRules): number {
  return Math.ceil((plannedMinutes * 60 * rules.minSessionPercent) / 100);
}

export function startSession(
  id: string,
  now: number,
  minutes: number,
  type: SessionType = 'standard',
): ActiveSession {
  if (!Number.isInteger(minutes) || minutes < MIN_SESSION_MINUTES || minutes > MAX_SESSION_MINUTES) {
    throw new Error(`Session length must be ${MIN_SESSION_MINUTES}–${MAX_SESSION_MINUTES} minutes`);
  }
  return { id, startedAt: now, endsAt: now + minutes * 60_000, plannedMinutes: minutes, blockHits: 0, type };
}

/** Credit (in seconds) for a stretch of focus. Below the session's minimum earns nothing. */
export function creditFor(focusedSeconds: number, plannedMinutes: number, rules: CreditRules): number {
  if (focusedSeconds < minimumSeconds(plannedMinutes, rules)) return 0;
  return Math.floor((focusedSeconds * rules.earnMinutesPerHour) / 60);
}

/**
 * Close out a session at `now`. If now is at/after endsAt (e.g. the alarm fired late, or the
 * worker was asleep), it counts as completed and is capped at the planned length.
 */
export function finishSession(
  s: ActiveSession,
  now: number,
  rules: CreditRules,
  rolloverHour: number,
  reason: Exclude<EndReason, 'completed'> = 'stopped',
): SessionRecord {
  const completed = now >= s.endsAt;
  const endedAt = completed ? s.endsAt : Math.max(now, s.startedAt);
  const focusedSeconds = Math.floor((endedAt - s.startedAt) / 1000);
  return {
    id: s.id,
    dayKey: toDayKey(s.startedAt, rolloverHour),
    startedAt: s.startedAt,
    endedAt,
    plannedMinutes: s.plannedMinutes,
    focusedSeconds,
    outcome: completed ? 'completed' : 'ended_early',
    creditEarnedSeconds: creditFor(focusedSeconds, s.plannedMinutes, rules),
    blockHits: s.blockHits,
    updatedAt: now,
    sessionType: s.type ?? 'standard',
    endReason: completed ? 'completed' : reason,
  };
}
