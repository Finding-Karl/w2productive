/** Messages from UI pages to the service worker. */
export type Message =
  | { type: 'session/start'; minutes: number }
  | { type: 'session/stop' }
  | { type: 'session/blockHit' };

export type Reply = { ok: true } | { ok: false; error: string };

export async function send(msg: Message): Promise<Reply> {
  return (await browser.runtime.sendMessage(msg)) as Reply;
}
