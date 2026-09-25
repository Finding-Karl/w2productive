import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ListKind } from '@/src/core/lists';
import {
  addEntry, createCollective, createGroup, deleteGroup, joinCollective, joinGroup, leaveGroup, loadGroupsData,
  removeEntry, removeGroupFromCollective, setDeepFocusRules, setGroupRole, type Collective, type DeepFocusRuleColumns,
  type Entry, type Group, type GroupsData, type ListOwner,
} from '@/src/lib/groups';
import { ConfirmButton } from './ConfirmButton';
import { DeepFocusRulesEditor } from './DeepFocusRulesEditor';
import { send } from '@/src/messages';
import { ListEditor } from './ListEditor';
import { useAuthUser } from './useAuthUser';

export function GroupsTab() {
  const user = useAuthUser();
  const [data, setData] = useState<GroupsData>();
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    try {
      setData(await loadGroupsData());
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (user) void reload();
  }, [user, reload]);

  /** Run a mutation, then refresh this page and the worker's inherited-list cache. */
  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => {
      await fn();
      await reload();
      void send({ type: 'sync/now' });
    },
    [reload],
  );

  if (user === undefined) return null;
  if (!user) return <p className="muted">Sign in on the Account tab to create or join groups.</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const myRole = (groupId: string) =>
    data.members.find((m) => m.group_id === groupId && m.user_id === user.id)?.role;
  const isGroupAdmin = (groupId: string) => ['owner', 'admin'].includes(myRole(groupId) ?? '');
  const isCollectiveAdmin = (cid: string) =>
    data.collectiveAdmins.some((a) => a.collective_id === cid && a.user_id === user.id);
  const adminGroups = data.groups.filter((g) => isGroupAdmin(g.id));
  const name = (uid: string) => data.profiles.find((p) => p.id === uid)?.display_name ?? 'Someone';

  const listEditors = (owner: ListOwner, entries: Entry[], editable: boolean) =>
    (['block', 'allow'] as ListKind[]).map((kind) => (
      <ListEditor
        key={kind}
        title={kind === 'block' ? 'Blocked for everyone' : 'Allowed for everyone'}
        hint={kind === 'allow' ? 'Extends members’ allowlists (only matters in allowlist mode).' : undefined}
        items={entries.filter((e) => e.list === kind).map((e) => ({ domain: e.domain, removable: true }))}
        editable={editable}
        onAdd={(d) => mutate(() => addEntry(owner, kind, d))}
        onRemove={(d) => {
          const entry = entries.find((e) => e.list === kind && e.domain === d)!;
          return mutate(() => removeEntry(entry.id));
        }}
      />
    ));

  const rulesEditor = (kind: 'group' | 'collective', id: string, row: DeepFocusRuleColumns, editable: boolean) => (
    <DeepFocusRulesEditor
      key={`${id}:${row.deep_focus_grace_seconds}:${row.deep_focus_check_min_minutes}:${row.deep_focus_check_max_minutes}`}
      title="Deep focus checks"
      hint={editable ? 'Applies to every member’s deep focus sessions (strictest across group and collectives wins). Leave blank to not set.' : undefined}
      value={{ grace: row.deep_focus_grace_seconds, min: row.deep_focus_check_min_minutes, max: row.deep_focus_check_max_minutes }}
      editable={editable}
      onSave={(v) => mutate(() => setDeepFocusRules(kind, id, v))}
    />
  );

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <section style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Your group</h2>
        {data.groups.length === 0 && (
          <>
            <p className="muted" style={{ margin: 0 }}>You can be in one group at a time.</p>
            <div className="row">
              <InlineForm placeholder="New group name" button="Create group" onSubmit={(v) => mutate(() => createGroup(v))} />
              <InlineForm placeholder="Invite code" button="Join group" onSubmit={(v) => mutate(() => joinGroup(v))} />
            </div>
          </>
        )}
        {data.groups.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            role={myRole(g.id)!}
            members={data.members.filter((m) => m.group_id === g.id)}
            name={name}
            isOwner={g.owner_id === user.id}
            onRole={(uid, role) => mutate(() => setGroupRole(g.id, uid, role))}
            onLeave={() => mutate(() => leaveGroup(g.id, user.id))}
            onDelete={() => mutate(() => deleteGroup(g.id))}
          >
            {listEditors({ group_id: g.id }, data.entries.filter((e) => e.group_id === g.id), isGroupAdmin(g.id))}
            {rulesEditor('group', g.id, g, isGroupAdmin(g.id))}
          </GroupCard>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Collectives</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Groups join collectives. A collective’s lists apply to every member of every group in it.
        </p>
        {adminGroups.length > 0 ? (
          <CollectiveForms groups={adminGroups} mutate={mutate} />
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Only group owners and admins can add a group to a collective.</p>
        )}
        {data.collectives.map((c) => {
          const groupsIn = data.collectiveGroups.filter((cg) => cg.collective_id === c.id);
          return (
            <CollectiveCard key={c.id} collective={c} isAdmin={isCollectiveAdmin(c.id)} groupNames={groupsIn.map((g) => g.group_name)}>
              {listEditors({ collective_id: c.id }, data.entries.filter((e) => e.collective_id === c.id), isCollectiveAdmin(c.id))}
              {rulesEditor('collective', c.id, c, isCollectiveAdmin(c.id))}
              <div className="row">
                {groupsIn
                  .filter((cg) => isGroupAdmin(cg.group_id))
                  .map((cg) => (
                    <button key={cg.group_id} onClick={() => mutate(() => removeGroupFromCollective(c.id, cg.group_id))}>
                      Take {cg.group_name} out
                    </button>
                  ))}
              </div>
            </CollectiveCard>
          );
        })}
      </section>
    </div>
  );
}

function GroupCard(props: {
  group: Group;
  role: string;
  members: { user_id: string; role: string }[];
  name: (uid: string) => string;
  isOwner: boolean;
  onRole: (uid: string, role: 'admin' | 'member') => Promise<unknown>;
  onLeave: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  children: React.ReactNode;
}) {
  const { group, role, members, name, isOwner } = props;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{group.name}</strong> <span className="tag">{role}</span>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          Invite code <code>{group.invite_code}</code>
        </span>
      </div>
      <div style={{ display: 'grid', gap: 4, fontSize: 14 }}>
        {members.map((m) => (
          <div key={m.user_id} className="row">
            <span>{name(m.user_id)}</span>
            {m.role !== 'member' && <span className="tag">{m.role}</span>}
            {isOwner && m.role !== 'owner' && (
              <button style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => props.onRole(m.user_id, m.role === 'admin' ? 'member' : 'admin')}>
                {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
              </button>
            )}
          </div>
        ))}
      </div>
      {props.children}
      <div>
        {isOwner ? (
          <ConfirmButton
            label="Delete group"
            confirmLabel="Yes, delete it"
            hint="Removes the group for everyone, along with its lists and collective memberships. Owners can’t leave, so this is how you switch groups."
            onConfirm={props.onDelete}
          />
        ) : (
          <button onClick={props.onLeave}>Leave group</button>
        )}
      </div>
    </div>
  );
}

function CollectiveCard(props: { collective: Collective; isAdmin: boolean; groupNames: string[]; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{props.collective.name}</strong> {props.isAdmin && <span className="tag">admin</span>}
        </div>
        {props.isAdmin && (
          <span className="muted" style={{ fontSize: 13 }}>
            Invite code <code>{props.collective.invite_code}</code>
          </span>
        )}
      </div>
      <div className="muted" style={{ fontSize: 14 }}>Groups: {props.groupNames.join(', ')}</div>
      {props.children}
    </div>
  );
}

function CollectiveForms({ groups, mutate }: { groups: Group[]; mutate: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [groupId, setGroupId] = useState(groups[0]!.id);
  return (
    <div className="row">
      <label className="row" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 14 }}>For group</span>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </label>
      <InlineForm placeholder="New collective name" button="Create collective" onSubmit={(v) => mutate(() => createCollective(v, groupId))} />
      <InlineForm placeholder="Collective invite code" button="Join collective" onSubmit={(v) => mutate(() => joinCollective(v, groupId))} />
    </div>
  );
}

function InlineForm(props: { placeholder: string; button: string; onSubmit: (value: string) => Promise<unknown> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await props.onSubmit(value.trim());
      setValue('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 4 }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={props.placeholder} disabled={busy} />
        <button type="submit" disabled={busy || !value.trim()}>{props.button}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
