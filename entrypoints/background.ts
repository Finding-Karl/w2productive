import type { Message, Reply } from '@/src/messages';
import { finish, reconcile, recordBlockHit, SESSION_END_ALARM, start } from '@/src/background/sessions';
import { requestSync, SYNC_ALARM, SYNC_PERIOD_MINUTES } from '@/src/background/sync';

export default defineBackground(() => {
  // MV3: this worker is killed after ~30s idle. Listeners must be registered synchronously
  // here (not after an await) or Chrome won't wake the worker for them. No state in module
  // scope — every handler re-reads chrome.storage.

  const boot = async () => {
    await reconcile();
    await browser.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
    await requestSync();
  };
  browser.runtime.onInstalled.addListener(() => void boot());
  browser.runtime.onStartup.addListener(() => void boot());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SESSION_END_ALARM) void finish();
    if (alarm.name === SYNC_ALARM) void requestSync();
  });

  browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    handle(msg).then(
      () => sendResponse({ ok: true } satisfies Reply),
      (e: unknown) => sendResponse({ ok: false, error: String((e as Error)?.message ?? e) } satisfies Reply),
    );
    return true; // keep the channel open for the async response
  });
});

async function handle(msg: Message): Promise<void> {
  switch (msg.type) {
    case 'session/start':
      return start(msg.minutes);
    case 'session/stop':
      return finish();
    case 'session/blockHit':
      return recordBlockHit();
    case 'sync/now':
      return requestSync();
  }
}
