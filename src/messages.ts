import type { PersonalLists } from './core/lists';
import type { SessionType } from './core/session';
import type { DeepFocusParams } from './core/deepFocus';

/** Messages from UI pages to the service worker. */
export type Message =
  | { type: 'session/start'; minutes: number; sessionType?: SessionType }
  | { type: 'session/stop' }
  | { type: 'session/blockHit' }
  | { type: 'sync/now' }
  | { type: 'lists/update'; patch: Partial<PersonalLists> }
  | { type: 'deep/verify'; code: string }
  | { type: 'deepFocus/updateDefaults'; params: DeepFocusParams };

export type Reply = { ok: true; data?: unknown } | { ok: false; error: string };

export async function send(msg: Message): Promise<Reply> {
  return (await browser.runtime.sendMessage(msg)) as Reply;
}
