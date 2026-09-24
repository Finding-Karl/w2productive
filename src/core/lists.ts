import type { ListConfig } from './domain';

export type ListKind = 'block' | 'allow';

/** A list entry inherited from a group or collective (cached from the server). */
export interface InheritedEntry {
  source: 'group' | 'collective';
  sourceId: string;
  sourceName: string;
  list: ListKind;
  domain: string;
}

export interface PersonalLists {
  listMode: 'blocklist' | 'allowlist';
  blocklist: string[];
  allowlist: string[];
}

/**
 * Merge personal lists with everything inherited from groups and collectives.
 * Your list mode stays yours; blocklists from every level apply in both modes
 * (and win over allows); allowlists from every level only matter in allowlist mode.
 */
export function effectiveLists(personal: PersonalLists, inherited: readonly InheritedEntry[]): ListConfig {
  const pick = (kind: ListKind) => inherited.filter((e) => e.list === kind).map((e) => e.domain);
  return {
    listMode: personal.listMode,
    blocklist: [...new Set([...personal.blocklist, ...pick('block')])].sort(),
    allowlist: [...new Set([...personal.allowlist, ...pick('allow')])].sort(),
  };
}

/** Stable comparison key, used to skip re-applying rules when nothing changed. */
export function inheritedKey(entries: readonly InheritedEntry[]): string {
  return entries
    .map((e) => `${e.source}:${e.sourceId}:${e.list}:${e.domain}`)
    .sort()
    .join('|');
}
