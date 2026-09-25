/**
 * Deep focus: allowlist-only sessions kept alive by presence checks at random times.
 * Pure logic — scheduling and enforcement live in src/background/deepFocus.ts.
 */

export interface DeepFocusParams {
  /** Seconds allowed to answer a check. */
  graceSeconds: number;
  /** Checks happen at a random time every [minMinutes, maxMinutes] minutes. */
  minMinutes: number;
  maxMinutes: number;
}

export const DEEP_FOCUS_DEFAULTS: DeepFocusParams = { graceSeconds: 60, minMinutes: 10, maxMinutes: 20 };
export const DEEP_FOCUS_LIMITS = { graceSeconds: [15, 300], minutes: [2, 60] } as const;

/** Rule set on your group or one of its collectives (null = not set at that level). */
export interface InheritedDeepFocusRule {
  source: 'group' | 'collective';
  sourceId: string;
  sourceName: string;
  graceSeconds: number | null;
  minMinutes: number | null;
  maxMinutes: number | null;
}

export interface ResolvedDeepFocus extends DeepFocusParams {
  /** Which group/collective set each value; null = your own default. */
  setBy: { grace: string | null; window: string | null };
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Strictest wins across your defaults, your group and its collectives: shortest grace,
 * lowest min, lowest max. Personal values can never loosen a moderator's.
 */
export function resolveDeepFocus(
  personalOrUndefined: DeepFocusParams | undefined,
  inherited: readonly InheritedDeepFocusRule[],
): ResolvedDeepFocus {
  // Settings saved before deep focus existed may be read before their migration lands.
  const personal = personalOrUndefined ?? DEEP_FOCUS_DEFAULTS;
  const pick = (key: keyof DeepFocusParams) => {
    let value = personal[key];
    let by: string | null = null;
    for (const r of inherited) {
      const v = r[key];
      if (v != null && v < value) {
        value = v;
        by = r.sourceName;
      }
    }
    return { value, by };
  };
  const grace = pick('graceSeconds');
  const min = pick('minMinutes');
  const max = pick('maxMinutes');
  const maxMinutes = clamp(max.value, DEEP_FOCUS_LIMITS.minutes);
  const minMinutes = Math.min(clamp(min.value, DEEP_FOCUS_LIMITS.minutes), maxMinutes);
  return {
    graceSeconds: clamp(grace.value, DEEP_FOCUS_LIMITS.graceSeconds),
    minMinutes,
    maxMinutes,
    setBy: { grace: grace.by, window: max.by ?? min.by },
  };
}

/** Delay until the next check: uniform in [min, max] minutes. */
export function nextCheckDelayMs(p: DeepFocusParams, rand: () => number = Math.random): number {
  return Math.round((p.minMinutes + rand() * (p.maxMinutes - p.minMinutes)) * 60_000);
}

/** No 0/O, 1/I/L, 2/Z, 5/S, 8/B: readable at a glance, hard to mistype. */
export const CODE_ALPHABET = 'ACDEFHJKMNPRTUVWXY34679';
export function makeCode(rand: () => number = Math.random, length = 4): string {
  return Array.from({ length }, () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]).join('');
}

export interface PendingCheck {
  code: string;
  issuedAt: number;
  deadline: number;
}

export interface DeepFocusState {
  params: ResolvedDeepFocus;
  /** When the next check fires (ignored while one is pending). */
  nextCheckAt: number;
  pending: PendingCheck | null;
  checksPassed: number;
}

export type VerifyResult = 'ok' | 'wrong' | 'expired' | 'none';

export function verifyCheck(state: DeepFocusState, input: string, now: number): VerifyResult {
  const p = state.pending;
  if (!p) return 'none';
  if (now > p.deadline) return 'expired';
  return input.trim().toUpperCase() === p.code ? 'ok' : 'wrong';
}

/**
 * What a worker waking up should do with a deep focus session. If Chrome was closed
 * (or asleep) through a check, nobody was there to answer it: that's a miss.
 */
export type DeepFocusWake =
  | { action: 'miss'; endAt: number }
  | { action: 'issue' }
  | { action: 'wait-deadline'; at: number }
  | { action: 'wait-check'; at: number };

export function onWake(state: DeepFocusState, now: number): DeepFocusWake {
  if (state.pending) {
    return now > state.pending.deadline
      ? { action: 'miss', endAt: state.pending.issuedAt }
      : { action: 'wait-deadline', at: state.pending.deadline };
  }
  const missedBy = state.nextCheckAt + state.params.graceSeconds * 1000;
  if (now > missedBy) return { action: 'miss', endAt: state.nextCheckAt };
  if (now >= state.nextCheckAt) return { action: 'issue' };
  return { action: 'wait-check', at: state.nextCheckAt };
}
