/**
 * Vanilla-DOM presence check overlay, mounted inside a closed shadow root so the page's
 * CSS can't touch it (and it can't touch the page). No React here: this ships into every
 * allowed page, so it stays tiny.
 */
import type { PendingCheck } from '@/src/core/deepFocus';

const STYLE = `
:host { all: initial; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  display: grid; place-items: center;
  background: rgb(23 23 22 / 0.72); backdrop-filter: blur(6px);
  font-family: system-ui, -apple-system, sans-serif;
  --bg: #fbfaf7; --fg: #1d1c1a; --muted: #6b6760; --accent: #2f7d4f; --border: #e4e0d8; --danger: #b4432f;
}
@media (prefers-color-scheme: dark) {
  .backdrop { --bg: #1d1d1b; --fg: #ecebe8; --muted: #9c978e; --accent: #5fbf85; --border: #33322f; --danger: #e0735f; }
}
.card {
  width: min(380px, calc(100vw - 32px)); box-sizing: border-box;
  background: var(--bg); color: var(--fg); border: 1px solid var(--border);
  border-radius: 14px; padding: 22px; display: grid; gap: 12px;
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.35);
}
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
h2 { margin: 0; font-size: 18px; }
.muted { color: var(--muted); font-size: 13px; margin: 0; }
.left { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 14px; }
.left.urgent { color: var(--danger); font-weight: 600; }
.code { font: 700 32px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.35em; user-select: none; }
form { display: flex; gap: 8px; }
input {
  flex: 1; min-width: 0; font: 600 16px ui-monospace, Menlo, monospace; letter-spacing: 0.2em; text-transform: uppercase;
  padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: inherit;
}
input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
button {
  font: 500 14px system-ui, sans-serif; padding: 8px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--accent); background: var(--accent); color: #fff;
}
button:disabled { opacity: 0.5; cursor: default; }
button.secondary { background: transparent; color: var(--fg); border-color: var(--border); }
.error { color: var(--danger); font-size: 13px; margin: 0; }
`;

export interface OverlayHandle {
  code: string;
  remove(): void;
  /** Switch to the "session ended" state (missed check). */
  showEnded(): void;
}

export function mountPresenceOverlay(opts: {
  pending: PendingCheck;
  graceSetBy: string | null;
  graceSeconds: number;
  verify: (code: string) => Promise<{ ok: boolean; error?: string; result?: unknown }>;
}): OverlayHandle {
  const host = document.createElement('focus-presence-check');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${STYLE}</style>
    <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="t">
      <div class="card">
        <div class="row"><h2 id="t">Still focusing?</h2><span class="left" aria-live="polite"></span></div>
        <p class="muted">Type this code to keep your deep focus session.</p>
        <div class="code" aria-label="Code ${opts.pending.code.split('').join(' ')}">${opts.pending.code}</div>
        <form>
          <input maxlength="${opts.pending.code.length}" autocomplete="off" spellcheck="false" aria-label="Code" />
          <button type="submit" disabled>Confirm</button>
        </form>
        <p class="error" hidden></p>
        ${opts.graceSetBy ? `<p class="muted">${opts.graceSeconds}s grace set by ${escapeHtml(opts.graceSetBy)}</p>` : ''}
      </div>
    </div>`;

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const card = $<HTMLDivElement>('.card');
  const input = $<HTMLInputElement>('input');
  const button = $<HTMLButtonElement>('button');
  const error = $<HTMLParagraphElement>('.error');
  const left = $<HTMLSpanElement>('.left');

  // Keep typing inside the overlay: don't let page shortcuts (Docs, GitHub, …) see the keys.
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
  input.addEventListener('paste', (e) => e.preventDefault());
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase();
    button.disabled = input.value.length < opts.pending.code.length;
  });

  let expiredSent = false;
  const tick = () => {
    const s = Math.max(0, Math.ceil((opts.pending.deadline - Date.now()) / 1000));
    left.textContent = `${s}s`;
    left.classList.toggle('urgent', s <= 10);
    if (s === 0 && !expiredSent) {
      expiredSent = true;
      // Let the worker settle it; it ends the session. (Its alarm is the backup.)
      void opts.verify('');
    }
  };
  tick();
  const timer = window.setInterval(tick, 250);

  $<HTMLFormElement>('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    error.hidden = true;
    const reply = await opts.verify(input.value);
    if (!reply.ok) {
      error.textContent = reply.error ?? 'Something went wrong';
      error.hidden = false;
      input.value = '';
      input.focus();
    }
    // Success: storage changes and the content script removes the overlay everywhere.
  });

  (document.body ?? document.documentElement).appendChild(host);
  if (document.hasFocus()) input.focus();
  window.addEventListener('focus', () => input.isConnected && input.focus(), { once: true });

  const remove = () => {
    window.clearInterval(timer);
    host.remove();
  };
  return {
    code: opts.pending.code,
    remove,
    showEnded() {
      window.clearInterval(timer);
      card.innerHTML = `<h2>Deep focus session ended</h2>
        <p class="muted">The presence check wasn’t answered in time, so this session wasn’t saved.</p>
        <div><button class="secondary" type="button">Dismiss</button></div>`;
      card.querySelector('button')!.addEventListener('click', remove);
    },
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
