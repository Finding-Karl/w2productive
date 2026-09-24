import { storage } from '#imports';
import type { ActiveSession, SessionRecord } from '@/src/core/session';

/** The running session, or null. Timestamps only — elapsed time is always computed. */
export const activeSessionItem = storage.defineItem<ActiveSession | null>('local:activeSession', {
  fallback: null,
  version: 1,
});

/** Finished sessions, append-only. Daily aggregates will be derived from this later. */
export const sessionLogItem = storage.defineItem<SessionRecord[]>('local:sessionLog', {
  fallback: [],
  version: 1,
});

/** Spendable credit. Stored in seconds to avoid float drift when hardcore spends per-second. */
export const creditItem = storage.defineItem<{ balanceSeconds: number; updatedAt: number }>(
  'local:credit',
  { fallback: { balanceSeconds: 0, updatedAt: 0 }, version: 1 },
);
