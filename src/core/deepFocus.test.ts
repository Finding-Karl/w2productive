import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET, DEEP_FOCUS_DEFAULTS, makeCode, nextCheckDelayMs, onWake, resolveDeepFocus, verifyCheck,
  type DeepFocusState, type InheritedDeepFocusRule,
} from './deepFocus';

const rule = (name: string, g: number | null, min: number | null, max: number | null): InheritedDeepFocusRule => ({
  source: 'group', sourceId: name, sourceName: name, graceSeconds: g, minMinutes: min, maxMinutes: max,
});

describe('resolveDeepFocus', () => {
  it('uses personal defaults when nothing is inherited', () => {
    expect(resolveDeepFocus(DEEP_FOCUS_DEFAULTS, [])).toEqual({ ...DEEP_FOCUS_DEFAULTS, setBy: { grace: null, window: null } });
  });
  it('strictest wins per field, and records who set it', () => {
    const r = resolveDeepFocus(DEEP_FOCUS_DEFAULTS, [rule('Study', 90, 5, 30), rule('Bootcamp', 30, null, 15)]);
    expect(r).toMatchObject({ graceSeconds: 30, minMinutes: 5, maxMinutes: 15 });
    expect(r.setBy).toEqual({ grace: 'Bootcamp', window: 'Bootcamp' });
  });
  it('a looser moderator value does not loosen your default', () => {
    expect(resolveDeepFocus(DEEP_FOCUS_DEFAULTS, [rule('Study', 120, 30, 45)])).toMatchObject(DEEP_FOCUS_DEFAULTS);
  });
  it('keeps min <= max and clamps to limits', () => {
    const r = resolveDeepFocus({ graceSeconds: 5, minMinutes: 30, maxMinutes: 90 }, [rule('G', null, null, 12)]);
    expect(r).toMatchObject({ graceSeconds: 15, minMinutes: 12, maxMinutes: 12 });
  });
});

describe('scheduling and codes', () => {
  it('delay spans [min, max] minutes', () => {
    const p = { graceSeconds: 60, minMinutes: 10, maxMinutes: 20 };
    expect(nextCheckDelayMs(p, () => 0)).toBe(600_000);
    expect(nextCheckDelayMs(p, () => 0.999999)).toBeCloseTo(1_200_000, -2);
  });
  it('codes use the unambiguous alphabet', () => {
    const code = makeCode();
    expect(code).toHaveLength(4);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
  });
});

const state = (over: Partial<DeepFocusState> = {}): DeepFocusState => ({
  params: { ...DEEP_FOCUS_DEFAULTS, setBy: { grace: null, window: null } },
  nextCheckAt: 1_000_000,
  pending: null,
  checksPassed: 0,
  ...over,
});

describe('verifyCheck', () => {
  const s = state({ pending: { code: 'K7Q4', issuedAt: 0, deadline: 60_000 } });
  it('accepts the code case-insensitively within the grace window', () => {
    expect(verifyCheck(s, ' k7q4 ', 59_000)).toBe('ok');
  });
  it('rejects wrong codes, late answers, and no pending check', () => {
    expect(verifyCheck(s, 'K7Q9', 1000)).toBe('wrong');
    expect(verifyCheck(s, 'K7Q4', 60_001)).toBe('expired');
    expect(verifyCheck(state(), 'K7Q4', 0)).toBe('none');
  });
});

describe('onWake', () => {
  it('pending and past deadline -> miss, ending when the check was issued', () => {
    expect(onWake(state({ pending: { code: 'X', issuedAt: 500, deadline: 1000 } }), 2000)).toEqual({ action: 'miss', endAt: 500 });
  });
  it('slept through a check entirely -> miss at the check time', () => {
    expect(onWake(state(), 1_000_000 + 61_000)).toEqual({ action: 'miss', endAt: 1_000_000 });
  });
  it('check due but still within grace -> issue it now', () => {
    expect(onWake(state(), 1_000_000 + 30_000)).toEqual({ action: 'issue' });
  });
  it('otherwise wait', () => {
    expect(onWake(state(), 0)).toEqual({ action: 'wait-check', at: 1_000_000 });
  });
});

describe('resolveDeepFocus with a pre-migration save', () => {
  it('falls back to defaults when personal settings are missing', () => {
    expect(resolveDeepFocus(undefined, [])).toMatchObject(DEEP_FOCUS_DEFAULTS);
  });
});
