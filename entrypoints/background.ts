import type { Message, Reply } from '@/src/messages';
import { finish, reconcile, recordBlockHit, SESSION_END_ALARM, start } from '@/src/background/sessions';

export default defineBackground(() => {
  // MV3: this worker is killed after ~30s idle. Listeners must be registered synchronously
  // here (not after an await) or Chrome won't wake the worker for them. No state in module
  // scope — every handler re-reads chrome.storage.

  browser.runtime.onInstalled.addListener(() => void reconcile());
  browser.runtime.onStartup.addListener(() => void reconcile());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SESSION_END_ALARM) void finish();
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
  }
}
