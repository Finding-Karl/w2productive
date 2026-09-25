import { isUrlBlocked } from '@/src/core/domain';
import { effectiveLists } from '@/src/core/lists';
import type { Message, Reply } from '@/src/messages';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem, inheritedListsItem } from '@/src/storage/state';
import { mountPresenceOverlay, type OverlayHandle } from '@/src/ui/presenceOverlay';

/**
 * Deep focus presence checks, shown as an overlay on pages that are on the session's
 * allowlist. Blocked pages never get here (DNR sends them to blocked.html first).
 */
export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    // May also be injected by the worker into tabs opened before the extension loaded.
    const w = window as unknown as { __focusPresence?: boolean };
    if (w.__focusPresence) return;
    w.__focusPresence = true;

    let overlay: OverlayHandle | null = null;
    let deadline: number | null = null;

    const verify = async (code: string) => {
      const reply = (await browser.runtime.sendMessage({ type: 'deep/verify', code } satisfies Message)) as Reply;
      return reply.ok ? { ok: true, result: reply.data } : { ok: false, error: reply.error };
    };

    const allowedHere = async () => {
      const [settings, inherited] = await Promise.all([settingsItem.getValue(), inheritedListsItem.getValue()]);
      const cfg = effectiveLists({ ...settings, listMode: 'allowlist' }, inherited.entries); // deep = allowlist-only
      return !isUrlBlocked(location.href, cfg);
    };

    const render = async () => {
      const s = await activeSessionItem.getValue();
      const pending = s?.type === 'deep' ? (s.deep?.pending ?? null) : null;

      if (!pending) {
        if (overlay) {
          // Session gone after the deadline = the check was missed: say so rather than vanish.
          // Answered, or stopped early from the popup: just go away.
          if (!s && deadline != null && Date.now() >= deadline) overlay.showEnded();
          else overlay.remove();
          overlay = null;
          deadline = null;
        }
        return;
      }
      if (overlay?.code === pending.code) return;
      if (!(await allowedHere())) return;
      overlay?.remove();
      overlay = mountPresenceOverlay({
        pending,
        graceSeconds: s!.deep!.params.graceSeconds,
        graceSetBy: s!.deep!.params.setBy.grace,
        verify,
      });
      deadline = pending.deadline;
    };

    activeSessionItem.watch(() => void render());
    browser.runtime.onMessage.addListener((msg: { type?: string }, _s, sendResponse) => {
      if (msg?.type === 'presence/ping') {
        sendResponse('pong');
        void render();
      }
    });
    void render();
  },
});
