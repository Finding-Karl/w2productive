import { normalizeDomain } from '@/src/core/domain';
import { inheritedKey, type InheritedEntry, type PersonalLists } from '@/src/core/lists';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem, inheritedListsItem } from '@/src/storage/state';
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

/** Replace the inherited cache; re-applies rules mid-session only if something changed. */
export async function setInheritedEntries(entries: InheritedEntry[]): Promise<void> {
  const changed = await serialized(async () => {
    const current = await inheritedListsItem.getValue();
    await inheritedListsItem.setValue({ entries, fetchedAt: Date.now() });
    return inheritedKey(current.entries) !== inheritedKey(entries);
  });
  if (changed) await refreshBlockingIfActive();
}
