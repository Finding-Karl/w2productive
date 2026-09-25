import {
  makeCode, nextCheckDelayMs, onWake, resolveDeepFocus, verifyCheck, type DeepFocusState,
} from '@/src/core/deepFocus';
import type { ActiveSession } from '@/src/core/session';
import { settingsItem } from '@/src/storage/settings';
import { isUrlBlocked } from '@/src/core/domain';
import { activeSessionItem, inheritedDeepFocusItem } from '@/src/storage/state';
import { currentListConfig } from './blocking';
import { serialized } from './queue';

export const DEEP_CHECK_ALARM = 'deep-check';
export const DEEP_DEADLINE_ALARM = 'deep-deadline';

/** Rules in effect right now (your defaults + group + collectives, strictest wins). */
export async function currentDeepFocusRules() {
  const [settings, inherited] = await Promise.all([settingsItem.getValue(), inheritedDeepFocusItem.getValue()]);
  return resolveDeepFocus(settings.deepFocus, inherited.rules);
}

/** Initial deep focus state for a session starting now. Rules are captured here, not re-read later. */
export async function initialDeepFocusState(now: number): Promise<DeepFocusState> {
  const params = await currentDeepFocusRules();
  return { params, nextCheckAt: now + nextCheckDelayMs(params), pending: null, checksPassed: 0 };
}

/** Arm the alarm for whatever the session is waiting on. Alarms fire >= 30s out at the earliest. */
export async function armDeepFocusAlarms(s: ActiveSession): Promise<void> {
  await browser.alarms.clear(DEEP_CHECK_ALARM);
  await browser.alarms.clear(DEEP_DEADLINE_ALARM);
  if (s.type !== 'deep' || !s.deep) return;
  if (s.deep.pending) {
    await browser.alarms.create(DEEP_DEADLINE_ALARM, { when: s.deep.pending.deadline + 500 });
  } else if (s.deep.nextCheckAt < s.endsAt) {
    await browser.alarms.create(DEEP_CHECK_ALARM, { when: s.deep.nextCheckAt });
  }
}

export async function clearDeepFocus(): Promise<void> {
  await browser.alarms.clear(DEEP_CHECK_ALARM);
  await browser.alarms.clear(DEEP_DEADLINE_ALARM);
}

/** Issue a presence check now: new code + deadline. It only shows as an overlay on allowed tabs. */
export async function issueCheck(): Promise<void> {
  const issued = await serialized(async () => {
    const s = await activeSessionItem.getValue();
    if (s?.type !== 'deep' || !s.deep || s.deep.pending) return null;
    const now = Date.now();
    const next: ActiveSession = {
      ...s,
      deep: { ...s.deep, pending: { code: makeCode(), issuedAt: now, deadline: now + s.deep.params.graceSeconds * 1000 } },
    };
    await activeSessionItem.setValue(next);
    return next;
  });
  if (!issued?.deep?.pending) return;
  await armDeepFocusAlarms(issued);
  await ensureOverlayInAllowedTabs();
}

/** Answer a check. Throws on a wrong code; a late answer ends the session (returns 'missed'). */
export async function verify(code: string): Promise<'ok' | 'missed' | 'none'> {
  const result = await serialized(async () => {
    const s = await activeSessionItem.getValue();
    if (s?.type !== 'deep' || !s.deep) return { kind: 'none' as const };
    const now = Date.now();
    const r = verifyCheck(s.deep, code, now);
    if (r === 'wrong') throw new Error('That code doesn’t match. Check it and try again.');
    if (r === 'none') return { kind: 'none' as const };
    if (r === 'expired') return { kind: 'missed' as const, endAt: s.deep.pending!.issuedAt };
    const next: ActiveSession = {
      ...s,
      deep: {
        ...s.deep,
        pending: null,
        checksPassed: s.deep.checksPassed + 1,
        nextCheckAt: now + nextCheckDelayMs(s.deep.params),
      },
    };
    await activeSessionItem.setValue(next);
    return { kind: 'ok' as const, session: next };
  });
  if (result.kind === 'ok') {
    await armDeepFocusAlarms(result.session);
    return 'ok';
  }
  if (result.kind === 'missed') {
    await onMissed(result.endAt);
    return 'missed';
  }
  return 'none';
}

/** Set by sessions.ts to avoid an import cycle. */
let onMissed: (endAt: number) => Promise<void> = async () => {};
export function setMissedHandler(fn: (endAt: number) => Promise<void>) {
  onMissed = fn;
}

/** Alarm handler + reconcile: decide what a waking worker should do. */
export async function handleDeepFocusWake(): Promise<void> {
  const s = await activeSessionItem.getValue();
  if (s?.type !== 'deep' || !s.deep) return;
  const w = onWake(s.deep, Date.now());
  if (w.action === 'miss') return onMissed(w.endAt);
  if (w.action === 'issue') return issueCheck();
  await armDeepFocusAlarms(s);
  if (w.action === 'wait-deadline') await ensureOverlayInAllowedTabs(); // worker restarted mid-check
}

/** Web tabs whose page is allowed in the current (deep, allowlist-only) session. */
async function allowedTabs() {
  const cfg = await currentListConfig();
  return (await browser.tabs.query({})).filter(
    (t) => t.id != null && t.url && /^https?:/.test(t.url) && !isUrlBlocked(t.url, cfg),
  );
}

/**
 * The overlay's content script only loads into pages opened after the extension (re)loaded.
 * Ping each allowed tab and inject into any that don't answer.
 */
async function ensureOverlayInAllowedTabs(): Promise<void> {
  const tabs = await allowedTabs();
  await Promise.all(
    tabs.map(async (t) => {
      const alive = await browser.tabs.sendMessage(t.id!, { type: 'presence/ping' }).catch(() => null);
      if (alive === 'pong') return;
      await browser.scripting
        .executeScript({ target: { tabId: t.id! }, files: ['/content-scripts/presence.js'] })
        .catch(() => {}); // e.g. the Web Store or other pages extensions can't touch
    }),
  );
}
