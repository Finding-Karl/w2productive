import { finishSession, startSession } from '@/src/core/session';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem } from '@/src/storage/state';
import { setBlocking } from './blocking';
import { backfillLedger, recordFinishedSession } from './ledger';
import { serialized } from './queue';
import { requestSync } from './sync';

export const SESSION_END_ALARM = 'session-end';

export const start = (minutes: number) =>
  serialized(async () => {
    if (await activeSessionItem.getValue()) throw new Error('A session is already running');
    const session = startSession(crypto.randomUUID(), Date.now(), minutes);
    await activeSessionItem.setValue(session);
    await browser.alarms.create(SESSION_END_ALARM, { when: session.endsAt });
    await setBlocking(true);
  });

/** Ends the running session now. Before endsAt this is "ended early" (partial credit). */
export const finish = () =>
  serialized(async () => {
    const active = await activeSessionItem.getValue();
    if (!active) return;
    const settings = await settingsItem.getValue();
    const now = Date.now();
    const record = finishSession(active, now, settings, settings.rolloverHour);

    await recordFinishedSession(record); // also clears the active session
    await browser.alarms.clear(SESSION_END_ALARM);
    await setBlocking(false);
    console.log('[focus] session finished', record);
  }).then(() => void requestSync());

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
  if (Date.now() >= active.endsAt) {
    await finish(); // counts as completed, capped at endsAt
    return;
  }
  const alarm = await browser.alarms.get(SESSION_END_ALARM);
  if (!alarm) await browser.alarms.create(SESSION_END_ALARM, { when: active.endsAt });
  await setBlocking(true);
}
