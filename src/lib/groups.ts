import { normalizeDomain } from '@/src/core/domain';
import type { ListKind } from '@/src/core/lists';
import { supabase } from './supabase';

/** Row shapes (see supabase/migrations). RLS scopes every select to what the user may see. */
export type GroupRole = 'owner' | 'admin' | 'member';
export interface DeepFocusRuleColumns {
  deep_focus_grace_seconds: number | null;
  deep_focus_check_min_minutes: number | null;
  deep_focus_check_max_minutes: number | null;
}
export interface Group extends DeepFocusRuleColumns { id: string; name: string; invite_code: string; owner_id: string }
export interface Member { group_id: string; user_id: string; role: GroupRole }
export interface Profile { id: string; display_name: string | null }
export interface Entry { id: string; group_id: string | null; collective_id: string | null; list: ListKind; domain: string }
export interface Collective extends DeepFocusRuleColumns { id: string; name: string; invite_code: string; owner_id: string }
export interface CollectiveGroup { collective_id: string; group_id: string; group_name: string }
export interface CollectiveAdmin { collective_id: string; user_id: string; role: 'owner' | 'admin' }

export interface GroupsData {
  groups: Group[];
  members: Member[];
  profiles: Profile[];
  entries: Entry[];
  collectives: Collective[];
  collectiveGroups: CollectiveGroup[];
  collectiveAdmins: CollectiveAdmin[];
}

function db() {
  if (!supabase) throw new Error('Backend not configured');
  return supabase;
}

async function run<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

const DEEP_COLS = 'deep_focus_grace_seconds, deep_focus_check_min_minutes, deep_focus_check_max_minutes';

export async function loadGroupsData(): Promise<GroupsData> {
  const s = db();
  const [groups, members, profiles, entries, collectives, collectiveGroups, collectiveAdmins] = await Promise.all([
    run<Group[]>(s.from('groups').select(`id, name, invite_code, owner_id, ${DEEP_COLS}`).order('created_at')),
    run<Member[]>(s.from('group_members').select('group_id, user_id, role')),
    run<Profile[]>(s.from('profiles').select('id, display_name')),
    run<Entry[]>(s.from('list_entries').select('id, group_id, collective_id, list, domain').order('domain')),
    run<Collective[]>(s.from('collectives').select(`id, name, invite_code, owner_id, ${DEEP_COLS}`).order('created_at')),
    run<CollectiveGroup[]>(s.rpc('my_collective_groups')),
    run<CollectiveAdmin[]>(s.from('collective_admins').select('collective_id, user_id, role')),
  ]);
  return { groups, members, profiles, entries, collectives, collectiveGroups, collectiveAdmins };
}

export const createGroup = (name: string) => run(db().rpc('create_group', { p_name: name }));
export const joinGroup = (code: string) => run(db().rpc('join_group', { p_invite_code: code }));
export const leaveGroup = (groupId: string, userId: string) =>
  run(db().from('group_members').delete().eq('group_id', groupId).eq('user_id', userId));
/** Owners only (RLS). Cascades to members, the group's lists and its collective memberships. */
export const deleteGroup = (groupId: string) => run(db().from('groups').delete().eq('id', groupId));

/** Moderators set deep focus rules for their group or collective; nulls clear them. */
export const setDeepFocusRules = (
  kind: 'group' | 'collective',
  id: string,
  r: { grace: number | null; min: number | null; max: number | null },
) =>
  run(db().rpc('set_deep_focus_rules', { p_kind: kind, p_id: id, p_grace_seconds: r.grace, p_min_minutes: r.min, p_max_minutes: r.max }));

export const setGroupRole = (groupId: string, userId: string, role: 'admin' | 'member') =>
  run(db().rpc('set_group_role', { p_group_id: groupId, p_user_id: userId, p_role: role }));

export const createCollective = (name: string, groupId: string) =>
  run(db().rpc('create_collective', { p_name: name, p_group_id: groupId }));
export const joinCollective = (code: string, groupId: string) =>
  run(db().rpc('join_collective', { p_invite_code: code, p_group_id: groupId }));
export const removeGroupFromCollective = (collectiveId: string, groupId: string) =>
  run(db().from('collective_groups').delete().eq('collective_id', collectiveId).eq('group_id', groupId));

export type ListOwner = { group_id: string } | { collective_id: string };

export async function addEntry(owner: ListOwner, list: ListKind, raw: string) {
  const domain = normalizeDomain(raw);
  if (!domain) throw new Error(`"${raw}" isn't a valid domain`);
  const { data: auth } = await db().auth.getUser();
  return run(db().from('list_entries').insert({ ...owner, list, domain, created_by: auth.user?.id }));
}
export const removeEntry = (id: string) => run(db().from('list_entries').delete().eq('id', id));
