import { hostMatches } from '@/src/core/domain';
import { DEEP_FOCUS_DEFAULTS, resolveDeepFocus } from '@/src/core/deepFocus';
import { effectiveLists, type InheritedEntry, type ListKind } from '@/src/core/lists';
import { send } from '@/src/messages';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem, inheritedDeepFocusItem, inheritedListsItem } from '@/src/storage/state';
import { DeepFocusRulesEditor } from './DeepFocusRulesEditor';
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
  const inheritedDeep = useStorageItem(inheritedDeepFocusItem);
  if (!settings || !inherited || session === undefined || !inheritedDeep) return null;
  const deepRules = resolveDeepFocus(settings.deepFocus, inheritedDeep.rules);
  const deepDefaults = settings.deepFocus ?? DEEP_FOCUS_DEFAULTS;

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
      <div style={{ display: 'grid', gap: 8 }}>
        <DeepFocusRulesEditor
          title="Deep focus checks"
          hint="Your defaults for deep focus sessions. Your group and its collectives can only make them stricter."
          value={{ grace: deepDefaults.graceSeconds, min: deepDefaults.minMinutes, max: deepDefaults.maxMinutes }}
          editable={!locked}
          required
          onSave={async (v) => {
            const reply = await send({ type: 'deepFocus/updateDefaults', params: { graceSeconds: v.grace!, minMinutes: v.min!, maxMinutes: v.max! } });
            if (!reply.ok) throw new Error(reply.error);
          }}
        />
        <span className="muted" style={{ fontSize: 13 }}>
          In effect: {deepRules.graceSeconds}s to answer{deepRules.setBy.grace ? ` (set by ${deepRules.setBy.grace})` : ''}, checks every {deepRules.minMinutes}–{deepRules.maxMinutes} min{deepRules.setBy.window ? ` (set by ${deepRules.setBy.window})` : ''}.
        </span>
      </div>

      {inherited.fetchedAt && (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Group and collective lists last updated {new Date(inherited.fetchedAt).toLocaleString()}.
        </p>
      )}
    </div>
  );
}
