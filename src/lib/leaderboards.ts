import type { DayKey } from '@/src/core/dayKey';
import { supabase } from './supabase';

export interface MemberRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'member';
  focus_seconds: number;
  sessions: number;
}
export interface GroupRow {
  group_id: string;
  group_name: string;
  members: number;
  focus_seconds: number;
  sessions: number;
}
export interface ActivityRow {
  day_key: DayKey;
  focus_seconds: number;
  sessions: number;
}
export interface Range {
  from: DayKey | null;
  to: DayKey | null;
}

function db() {
  if (!supabase) throw new Error('Backend not configured');
  return supabase;
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
// bigint columns arrive as numbers from PostgREST; coerce defensively anyway.
function num<T extends object>(rows: T[], keys: (keyof T)[]): T[] {
  return rows.map((r) => {
    const out = { ...r } as Record<keyof T, unknown>;
    for (const k of keys) out[k] = Number(r[k]);
    return out as T;
  });
}

export const groupLeaderboard = async (groupId: string, r: Range) =>
  num(await rpc<MemberRow[]>('group_leaderboard', { p_group_id: groupId, p_from: r.from, p_to: r.to }), [
    'focus_seconds',
    'sessions',
  ]);

export const collectiveLeaderboard = async (collectiveId: string, r: Range) =>
  num(
    await rpc<GroupRow[]>('collective_leaderboard', { p_collective_id: collectiveId, p_from: r.from, p_to: r.to }),
    ['members', 'focus_seconds', 'sessions'],
  );

export const profileActivity = async (userId: string, from: DayKey, to: DayKey) =>
  num(await rpc<ActivityRow[]>('profile_activity', { p_user_id: userId, p_from: from, p_to: to }), [
    'focus_seconds',
    'sessions',
  ]);

export async function profileName(userId: string): Promise<string | null> {
  const { data, error } = await db().from('profiles').select('display_name').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}
