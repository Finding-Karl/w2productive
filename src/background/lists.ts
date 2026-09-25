import { normalizeDomain } from '@/src/core/domain';
import { inheritedKey, type InheritedEntry, type PersonalLists } from '@/src/core/lists';
import { settingsItem } from '@/src/storage/settings';
import { DEEP_FOCUS_LIMITS, type DeepFocusParams, type InheritedDeepFocusRule } from '@/src/core/deepFocus';
import { activeSessionItem, inheritedDeepFocusItem, inheritedListsItem } from '@/src/storage/state';
import { refreshBlockingIfActive } from './blocking';
import { serialized } from './queue';

export type ListsPatch = Partial<PersonalLists>;

function cleanDomains(input: string[]): string[] {
  const out = new Set<string>();
  for (const raw of input) {
    const d = normalizeDomain(raw);
    if (!d) throw new Error(`"${raw}" isn't a valid domain`);
    out.add(d);
  }
  return [...out].sort();
}

/** Update personal lists / mode. Settings can't change mid-session (spec: settings lock). */
export const updatePersonalLists = (patch: ListsPatch) =>
  serialized(async () => {
    if (await activeSessionItem.getValue()) {
      throw new Error('Lists are locked during a focus session');
    }
    const settings = await settingsItem.getValue();
    await settingsItem.setValue({
      ...settings,
      ...(patch.listMode ? { listMode: patch.listMode } : {}),
      ...(patch.blocklist ? { blocklist: cleanDomains(patch.blocklist) } : {}),
      ...(patch.allowlist ? { allowlist: cleanDomains(patch.allowlist) } : {}),
    });
  });

/**
 * Replace the inherited caches (lists + deep focus rules). Re-applies blocking mid-session
 * only if the lists changed; deep focus rules are captured at session start, so a change
 * applies from the next session.
 */
export async function setInheritedEntries(entries: InheritedEntry[], deepFocusRules: InheritedDeepFocusRule[]): Promise<void> {
  const changed = await serialized(async () => {
    const current = await inheritedListsItem.getValue();
    await inheritedListsItem.setValue({ entries, fetchedAt: Date.now() });
    await inheritedDeepFocusItem.setValue({ rules: deepFocusRules, fetchedAt: Date.now() });
    return inheritedKey(current.entries) !== inheritedKey(entries);
  });
  if (changed) await refreshBlockingIfActive();
}

/** Personal deep focus defaults (validated to the same bounds moderators get). */
export const updateDeepFocusDefaults = (p: DeepFocusParams) =>
  serialized(async () => {
    const [gLo, gHi] = DEEP_FOCUS_LIMITS.graceSeconds;
    const [mLo, mHi] = DEEP_FOCUS_LIMITS.minutes;
    const ok = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!ok(p.graceSeconds, gLo, gHi)) throw new Error(`Grace window must be ${gLo}–${gHi} seconds`);
    if (!ok(p.minMinutes, mLo, mHi) || !ok(p.maxMinutes, mLo, mHi)) throw new Error(`Check window must be ${mLo}–${mHi} minutes`);
    if (p.minMinutes > p.maxMinutes) throw new Error('The earliest check can’t be later than the latest');
    const settings = await settingsItem.getValue();
    await settingsItem.setValue({ ...settings, deepFocus: p });
  });
