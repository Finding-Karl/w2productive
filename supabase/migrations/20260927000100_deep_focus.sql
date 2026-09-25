-- Deep focus sessions: allowlist-only sessions kept alive by random presence checks.
--
-- Moderators (group owner/admins, collective admins) can set:
--   * grace window: seconds allowed to answer a check (15..300)
--   * check window: checks happen at a random time every [min, max] minutes (2..60)
-- A member's effective rules are the strictest across their group and its collectives
-- (shortest grace, lowest min, lowest max), resolved on the client and captured when
-- a session starts. NULL = not set at that level.

-------------------------------------------------------------------------------
-- Rule columns on groups and collectives
-------------------------------------------------------------------------------
alter table public.groups
  add column deep_focus_grace_seconds    int check (deep_focus_grace_seconds between 15 and 300),
  add column deep_focus_check_min_minutes int check (deep_focus_check_min_minutes between 2 and 60),
  add column deep_focus_check_max_minutes int check (deep_focus_check_max_minutes between 2 and 60),
  add constraint groups_deep_focus_window_check
    check (deep_focus_check_min_minutes is null or deep_focus_check_max_minutes is null
           or deep_focus_check_min_minutes <= deep_focus_check_max_minutes);

alter table public.collectives
  add column deep_focus_grace_seconds    int check (deep_focus_grace_seconds between 15 and 300),
  add column deep_focus_check_min_minutes int check (deep_focus_check_min_minutes between 2 and 60),
  add column deep_focus_check_max_minutes int check (deep_focus_check_max_minutes between 2 and 60),
  add constraint collectives_deep_focus_window_check
    check (deep_focus_check_min_minutes is null or deep_focus_check_max_minutes is null
           or deep_focus_check_min_minutes <= deep_focus_check_max_minutes);

-- Set (or clear, with nulls) the rules for a group or collective. Group owners/admins
-- or collective admins only. (Direct UPDATEs on groups stay owner-only.)
create function public.set_deep_focus_rules(
  p_kind          text,   -- 'group' | 'collective'
  p_id            uuid,
  p_grace_seconds int,
  p_min_minutes   int,
  p_max_minutes   int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'group' then
    if not public.is_group_admin(p_id) then raise exception 'only group owners and admins can change this'; end if;
    update public.groups set
      deep_focus_grace_seconds     = p_grace_seconds,
      deep_focus_check_min_minutes = p_min_minutes,
      deep_focus_check_max_minutes = p_max_minutes
    where id = p_id;
  elsif p_kind = 'collective' then
    if not public.is_collective_admin(p_id) then raise exception 'only collective admins can change this'; end if;
    update public.collectives set
      deep_focus_grace_seconds     = p_grace_seconds,
      deep_focus_check_min_minutes = p_min_minutes,
      deep_focus_check_max_minutes = p_max_minutes
    where id = p_id;
  else
    raise exception 'kind must be group or collective';
  end if;
end;
$$;

-- Every rule the caller inherits (only levels that set something).
create function public.my_deep_focus_rules()
returns table (
  source        text,
  source_id     uuid,
  source_name   text,
  grace_seconds int,
  min_minutes   int,
  max_minutes   int
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'group', g.id, g.name,
         g.deep_focus_grace_seconds, g.deep_focus_check_min_minutes, g.deep_focus_check_max_minutes
  from public.group_members m
  join public.groups g on g.id = m.group_id
  where m.user_id = auth.uid()
    and num_nonnulls(g.deep_focus_grace_seconds, g.deep_focus_check_min_minutes, g.deep_focus_check_max_minutes) > 0
  union
  select 'collective', c.id, c.name,
         c.deep_focus_grace_seconds, c.deep_focus_check_min_minutes, c.deep_focus_check_max_minutes
  from public.group_members m
  join public.collective_groups cg on cg.group_id = m.group_id
  join public.collectives c on c.id = cg.collective_id
  where m.user_id = auth.uid()
    and num_nonnulls(c.deep_focus_grace_seconds, c.deep_focus_check_min_minutes, c.deep_focus_check_max_minutes) > 0;
$$;

-------------------------------------------------------------------------------
-- Session type + why it ended
-------------------------------------------------------------------------------
alter table public.focus_sessions
  add column session_type text not null default 'standard' check (session_type in ('standard', 'deep')),
  add column end_reason   text check (end_reason in ('completed', 'stopped', 'missed_check'));

-------------------------------------------------------------------------------
-- Leaderboards: add deep focus time alongside total focus
-------------------------------------------------------------------------------
drop function public.group_leaderboard(uuid, date, date);
create function public.group_leaderboard(
  p_group_id uuid,
  p_from     date default null,
  p_to       date default null
)
returns table (
  user_id            uuid,
  display_name       text,
  avatar_url         text,
  role               text,
  focus_seconds      bigint,
  deep_focus_seconds bigint,
  sessions           bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_group(p_group_id) then raise exception 'not allowed'; end if;
  return query
    select m.user_id, p.display_name, p.avatar_url, m.role,
           coalesce(sum(s.focused_seconds), 0)::bigint,
           coalesce(sum(s.focused_seconds) filter (where s.session_type = 'deep'), 0)::bigint,
           count(s.id)
    from public.group_members m
    left join public.profiles p on p.id = m.user_id
    left join public.focus_sessions s
      on s.user_id = m.user_id
     and (p_from is null or s.day_key >= p_from)
     and (p_to   is null or s.day_key <= p_to)
    where m.group_id = p_group_id
    group by m.user_id, p.display_name, p.avatar_url, m.role
    order by 5 desc, 2;
end;
$$;

drop function public.collective_leaderboard(uuid, date, date);
create function public.collective_leaderboard(
  p_collective_id uuid,
  p_from          date default null,
  p_to            date default null
)
returns table (
  group_id           uuid,
  group_name         text,
  members            bigint,
  focus_seconds      bigint,
  deep_focus_seconds bigint,
  sessions           bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.in_collective(p_collective_id) then raise exception 'not allowed'; end if;
  return query
    select g.id, g.name,
           (select count(*) from public.group_members gm where gm.group_id = g.id),
           coalesce(sum(s.focused_seconds), 0)::bigint,
           coalesce(sum(s.focused_seconds) filter (where s.session_type = 'deep'), 0)::bigint,
           count(s.id)
    from public.collective_groups cg
    join public.groups g on g.id = cg.group_id
    left join public.group_members m on m.group_id = g.id
    left join public.focus_sessions s
      on s.user_id = m.user_id
     and (p_from is null or s.day_key >= p_from)
     and (p_to   is null or s.day_key <= p_to)
    where cg.collective_id = p_collective_id
    group by g.id, g.name
    order by 4 desc, 2;
end;
$$;

revoke execute on function public.set_deep_focus_rules(text, uuid, int, int, int)  from public, anon;
revoke execute on function public.my_deep_focus_rules()                             from public, anon;
revoke execute on function public.group_leaderboard(uuid, date, date)               from public, anon;
revoke execute on function public.collective_leaderboard(uuid, date, date)          from public, anon;
grant  execute on function public.set_deep_focus_rules(text, uuid, int, int, int)  to authenticated;
grant  execute on function public.my_deep_focus_rules()                             to authenticated;
grant  execute on function public.group_leaderboard(uuid, date, date)               to authenticated;
grant  execute on function public.collective_leaderboard(uuid, date, date)          to authenticated;
