import type { Message, Reply } from '@/src/messages';
import { finish, reconcile, recordBlockHit, SESSION_END_ALARM, start } from '@/src/background/sessions';
import { requestSync, SYNC_ALARM, SYNC_PERIOD_MINUTES } from '@/src/background/sync';
import { setInheritedEntries, updateDeepFocusDefaults, updatePersonalLists } from '@/src/background/lists';
import { DEEP_CHECK_ALARM, DEEP_DEADLINE_ALARM, handleDeepFocusWake, verify } from '@/src/background/deepFocus';

const AUTH_STORAGE_KEY = 'supabaseAuth'; // see src/lib/supabase.ts

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
    if (alarm.name === DEEP_CHECK_ALARM || alarm.name === DEEP_DEADLINE_ALARM) void handleDeepFocusWake();
  });

  // Sign-in/out happens on the options page; the worker reacts via storage.
  browser.storage.onChanged.addListener((changes, area) => {
    const auth = changes[AUTH_STORAGE_KEY];
    if (area !== 'local' || !auth) return;
    if (auth.oldValue && !auth.newValue) void setInheritedEntries([], []); // signed out: group rules stop applying
    if (!auth.oldValue && auth.newValue) void requestSync(); // signed in
  });

  browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    handle(msg).then(
      (data) => sendResponse({ ok: true, data } satisfies Reply),
      (e: unknown) => sendResponse({ ok: false, error: String((e as Error)?.message ?? e) } satisfies Reply),
    );
    return true; // keep the channel open for the async response
  });
});

async function handle(msg: Message): Promise<unknown> {
  switch (msg.type) {
    case 'session/start':
      return start(msg.minutes, msg.sessionType);
    case 'session/stop':
      return finish();
    case 'session/blockHit':
      return recordBlockHit();
    case 'sync/now':
      return requestSync();
    case 'lists/update':
      return updatePersonalLists(msg.patch);
    case 'deep/verify':
      return verify(msg.code);
    case 'deepFocus/updateDefaults':
      return updateDeepFocusDefaults(msg.params);
  }
}
