import { storage } from '#imports';
import { balanceOf, mergeById, mergeEvents, sessionEarnEvent, type CreditEvent } from '@/src/core/ledger';
import type { SessionRecord } from '@/src/core/session';
import {
  activeSessionItem, creditItem, creditLedgerItem, sessionLogItem, syncStateItem, type SyncState,
} from '@/src/storage/state';

/** Must be called inside serialized(). */
export async function getDeviceId(): Promise<string> {
  const state = await syncStateItem.getValue();
  if (state.deviceId) return state.deviceId;
  const deviceId = crypto.randomUUID();
  await syncStateItem.setValue({ ...state, deviceId });
  return deviceId;
}

/**
 * Record a finished session locally: session log + ledger event + cached balance + outbox,
 * and clear the active session — all in one write, so a worker killed mid-way can't
 * leave the session both active and logged (which would credit it twice).
 * Must be called inside serialized().
 */
export async function recordFinishedSession(record: SessionRecord): Promise<void> {
  const deviceId = await getDeviceId();
  const event = sessionEarnEvent(record, crypto.randomUUID(), deviceId);
  const [log, ledger, sync] = await Promise.all([
    sessionLogItem.getValue(),
    creditLedgerItem.getValue(),
    syncStateItem.getValue(),
  ]);
  const nextLedger = event ? [...ledger, event] : ledger;
  await writeAll({
    log: [...log, record],
    ledger: nextLedger,
    sync: {
      ...sync,
      pendingSessionIds: [...sync.pendingSessionIds, record.id],
      pendingEventIds: event ? [...sync.pendingEventIds, event.id] : sync.pendingEventIds,
    },
    clearActiveSession: true,
  });
}

/** Merge rows pulled from the server and clear confirmed outbox ids. Must be inside serialized(). */
export async function applySyncResult(r: {
  userId: string;
  pulledEvents: CreditEvent[];
  pulledSessions: SessionRecord[];
  pushedEventIds: string[];
  pushedSessionIds: string[];
  cursors: SyncState['cursors'];
}): Promise<void> {
  const [log, ledger, sync] = await Promise.all([
    sessionLogItem.getValue(),
    creditLedgerItem.getValue(),
    syncStateItem.getValue(),
  ]);
  const pushedE = new Set(r.pushedEventIds);
  const pushedS = new Set(r.pushedSessionIds);
  await writeAll({
    log: mergeById(log, r.pulledSessions, (s) => s.startedAt),
    ledger: mergeEvents(ledger, r.pulledEvents),
    sync: {
      ...sync,
      userId: r.userId,
      pendingEventIds: sync.pendingEventIds.filter((id) => !pushedE.has(id)),
      pendingSessionIds: sync.pendingSessionIds.filter((id) => !pushedS.has(id)),
      cursors: r.cursors,
      lastSyncedAt: Date.now(),
      lastError: null,
    },
  });
}

/**
 * One-time: sessions finished before the ledger existed only bumped the cached balance.
 * Turn them into ledger events and queue everything for the first sync. Inside serialized().
 */
export async function backfillLedger(): Promise<void> {
  const sync = await syncStateItem.getValue();
  if (sync.ledgerBackfilled) return;
  const deviceId = await getDeviceId();
  const [log, ledger] = await Promise.all([sessionLogItem.getValue(), creditLedgerItem.getValue()]);
  const covered = new Set(ledger.map((e) => e.sessionId));
  const events = log
    .filter((s) => !covered.has(s.id))
    .map((s) => sessionEarnEvent(s, crypto.randomUUID(), deviceId))
    .filter((e): e is CreditEvent => e !== null);
  const fresh = await syncStateItem.getValue();
  await writeAll({
    log,
    ledger: mergeEvents(ledger, events),
    sync: {
      ...fresh,
      pendingEventIds: [...fresh.pendingEventIds, ...events.map((e) => e.id)],
      pendingSessionIds: [...new Set([...fresh.pendingSessionIds, ...log.map((s) => s.id)])],
      ledgerBackfilled: true,
    },
  });
}

async function writeAll(next: {
  log: SessionRecord[];
  ledger: CreditEvent[];
  sync: SyncState;
  clearActiveSession?: boolean;
}) {
  // One chrome.storage.local.set call, so the balance can't disagree with the ledger.
  await storage.setItems([
    { item: sessionLogItem, value: next.log },
    { item: creditLedgerItem, value: next.ledger },
    { item: creditItem, value: { balanceSeconds: balanceOf(next.ledger), updatedAt: Date.now() } },
    { item: syncStateItem, value: next.sync },
    ...(next.clearActiveSession ? [{ item: activeSessionItem, value: null }] : []),
  ]);
}
