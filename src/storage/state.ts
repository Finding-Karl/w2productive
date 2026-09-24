import { storage } from '#imports';
import type { CreditEvent } from '@/src/core/ledger';
import type { InheritedEntry } from '@/src/core/lists';
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

/**
 * Cached balance = sum of creditLedger. Kept as its own item so UIs can watch one small value.
 * Only src/background/ledger.ts writes it. Seconds, to avoid float drift in per-second spend.
 */
export const creditItem = storage.defineItem<{ balanceSeconds: number; updatedAt: number }>(
  'local:credit',
  { fallback: { balanceSeconds: 0, updatedAt: 0 }, version: 1 },
);

/** Append-only credit ledger (this device's events + any pulled from other devices). */
export const creditLedgerItem = storage.defineItem<CreditEvent[]>('local:creditLedger', {
  fallback: [],
  version: 1,
});

export interface SyncState {
  deviceId: string | null;
  /** Account the synced data belongs to; a different sign-in resets the pull cursor. */
  userId: string | null;
  /** Outbox: local records not yet confirmed by the server. */
  pendingEventIds: string[];
  pendingSessionIds: string[];
  /** Server created_at of the newest row pulled, per table. */
  cursors: { creditEvents: string | null; focusSessions: string | null };
  lastSyncedAt: number | null;
  lastError: string | null;
  /** One-time backfill of the ledger from pre-ledger session history. */
  ledgerBackfilled: boolean;
}

export const syncStateItem = storage.defineItem<SyncState>('local:sync', {
  fallback: {
    deviceId: null,
    userId: null,
    pendingEventIds: [],
    pendingSessionIds: [],
    cursors: { creditEvents: null, focusSessions: null },
    lastSyncedAt: null,
    lastError: null,
    ledgerBackfilled: false,
  },
  version: 1,
});

/**
 * Block/allow entries inherited from the user's groups and collectives, cached from the
 * server so enforcement works offline. Replaced wholesale on each sync; cleared on sign-out.
 */
export const inheritedListsItem = storage.defineItem<{
  entries: InheritedEntry[];
  fetchedAt: number | null;
}>('local:inheritedLists', { fallback: { entries: [], fetchedAt: null }, version: 1 });
