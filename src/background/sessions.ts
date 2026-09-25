import { finishSession, startSession, type EndReason, type SessionType } from '@/src/core/session';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem } from '@/src/storage/state';
import { setBlocking } from './blocking';
import {
  armDeepFocusAlarms, clearDeepFocus, handleDeepFocusWake, initialDeepFocusState, setMissedHandler,
} from './deepFocus';
import { backfillLedger, recordFinishedSession } from './ledger';
import { serialized } from './queue';
import { requestSync } from './sync';

export const SESSION_END_ALARM = 'session-end';

export const start = (minutes: number, type: SessionType = 'standard') =>
  serialized(async () => {
    if (await activeSessionItem.getValue()) throw new Error('A session is already running');
    const now = Date.now();
    const session = startSession(crypto.randomUUID(), now, minutes, type);
    if (type === 'deep') session.deep = await initialDeepFocusState(now);
    await activeSessionItem.setValue(session);
    await browser.alarms.create(SESSION_END_ALARM, { when: session.endsAt });
    await armDeepFocusAlarms(session);
    await setBlocking(true); // deep sessions get allowlist-only rules (see blocking.ts)
    return session;
  });

/**
 * Ends the running session.
 *  - Standard: before endsAt it's "ended early" (partial credit past the minimum).
 *  - Deep focus is all or nothing: only a session that reaches endsAt is saved. Stopping
 *    early or missing a check discards it — no history, focus time, credit or sync.
 * `endAt` caps the end time (a check missed while Chrome was closed ends it at the check).
 */
export const finish = (reason: Exclude<EndReason, 'completed'> = 'stopped', endAt?: number) =>
  serialized(async () => {
    const active = await activeSessionItem.getValue();
    if (!active) return false;
    const settings = await settingsItem.getValue();
    const now = endAt != null ? Math.min(Date.now(), endAt) : Date.now();
    const completed = now >= active.endsAt;

    if (active.type === 'deep' && !completed) {
      await activeSessionItem.setValue(null); // discard: nothing recorded
      console.log('[focus] deep focus session not completed — not saved');
    } else {
      const record = finishSession(active, now, settings, settings.rolloverHour, reason);
      await recordFinishedSession(record); // also clears the active session
      console.log('[focus] session finished', record);
    }
    await browser.alarms.clear(SESSION_END_ALARM);
    await clearDeepFocus();
    await setBlocking(false);
    return active.type !== 'deep' || completed; // whether anything was saved
  }).then((saved) => {
    if (saved) void requestSync();
  });

setMissedHandler((endAt) => finish('missed_check', endAt));

export const recordBlockHit = () =>
  serialized(async () => {
    const active = await activeSessionItem.getValue();
    if (active) await activeSessionItem.setValue({ ...active, blockHits: active.blockHits + 1 });
  });

/**
 * Bring alarms and DNR rules in line with stored state. Runs on install/startup, since
 * alarms can be lost on update/reinstall and the browser may have been closed past endsAt.
 */
export async function reconcile(): Promise<void> {
  await serialized(backfillLedger);
  const active = await activeSessionItem.getValue();
  if (!active) {
    await setBlocking(false);
    return;
  }
  if (active.type === 'deep') {
    await handleDeepFocusWake(); // may end the session if a check was missed while Chrome was closed
    if (!(await activeSessionItem.getValue())) return;
  }
  if (Date.now() >= active.endsAt) {
    await finish(); // counts as completed, capped at endsAt
    return;
  }
  const alarm = await browser.alarms.get(SESSION_END_ALARM);
  if (!alarm) await browser.alarms.create(SESSION_END_ALARM, { when: active.endsAt });
  await setBlocking(true);
}
