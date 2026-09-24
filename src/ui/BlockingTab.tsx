import { hostMatches } from '@/src/core/domain';
import { effectiveLists, type InheritedEntry, type ListKind } from '@/src/core/lists';
import { send } from '@/src/messages';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem, inheritedListsItem } from '@/src/storage/state';
import { useStorageItem } from './hooks';
import { ListEditor, type ListItem } from './ListEditor';

async function update(patch: Parameters<typeof send>[0] & { type: 'lists/update' }) {
  const reply = await send(patch);
  if (!reply.ok) throw new Error(reply.error);
}

function viaLabel(e: InheritedEntry) {
  return `${e.sourceName} ${e.source === 'group' ? 'group' : 'collective'}`;
}

export function BlockingTab() {
  const settings = useStorageItem(settingsItem);
  const inherited = useStorageItem(inheritedListsItem);
  const session = useStorageItem(activeSessionItem);
  if (!settings || !inherited || session === undefined) return null;

  const locked = !!session;
  const blocked = effectiveLists(settings, inherited.entries).blocklist;
  const items = (kind: ListKind, personal: string[]): ListItem[] => [
    ...personal.map((domain) => ({
      domain,
      removable: true,
      // A personal allow that a block (yours or inherited) covers has no effect; say so.
      ...(kind === 'allow' && blocked.some((b) => hostMatches(domain, b)) ? { via: 'overridden by a block' } : {}),
    })),
    ...inherited.entries
      .filter((e) => e.list === kind)
      .map((e) => ({ domain: e.domain, via: viaLabel(e), removable: false })),
  ];
  const setList = (key: 'blocklist' | 'allowlist') => ({
    onAdd: (d: string) => update({ type: 'lists/update', patch: { [key]: [...settings[key], d] } }),
    onRemove: (d: string) =>
      update({ type: 'lists/update', patch: { [key]: settings[key].filter((x) => x !== d) } }),
  });

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {locked && <div className="notice">Lists are locked while a focus session is running.</div>}

      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <strong>Mode</strong>
        {(['blocklist', 'allowlist'] as const).map((mode) => (
          <label key={mode} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <input
              type="radio"
              name="listMode"
              checked={settings.listMode === mode}
              onChange={() => update({ type: 'lists/update', patch: { listMode: mode } })}
            />
            <span>
              {mode === 'blocklist' ? 'Blocklist' : 'Allowlist'}
              <span className="muted" style={{ fontSize: 13 }}>
                {mode === 'blocklist'
                  ? ' — block only the sites on your blocked list'
                  : ' — block everything except allowed sites'}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <ListEditor
        title="Blocked sites"
        hint="Always blocked during sessions, in either mode. Blocks from your groups and collectives can’t be overridden by an allow."
        items={items('block', settings.blocklist)}
        editable={!locked}
        {...setList('blocklist')}
      />
      <ListEditor
        title="Allowed sites"
        hint={
          settings.listMode === 'allowlist'
            ? 'The only sites you can open during a session (plus localhost).'
            : 'Only used in allowlist mode.'
        }
        items={items('allow', settings.allowlist)}
        editable={!locked}
        {...setList('allowlist')}
      />
      {inherited.fetchedAt && (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Group and collective lists last updated {new Date(inherited.fetchedAt).toLocaleString()}.
        </p>
      )}
    </div>
  );
}
