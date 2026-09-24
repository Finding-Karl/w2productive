-- Leaderboards (group + collective) over arbitrary day windows, and profile heatmaps.
--
-- Visibility: you can see someone on a leaderboard, and open their profile, if you share
-- a group with them OR your groups share a collective. Profiles expose daily focus totals
-- only — never sessions' sites (which never leave the device anyway).
--
-- Windows are inclusive local day_key ranges computed by the viewer's client
-- (null = unbounded), e.g. today, Monday..today, 1st..today, all time.

-------------------------------------------------------------------------------
-- Visibility helpers
-------------------------------------------------------------------------------
create function public.shares_leaderboard_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select other = auth.uid()
    or public.shares_group_with(other)
    or exists (
      select 1
      from public.group_members a
      join public.collective_groups ca on ca.group_id = a.group_id
      join public.collective_groups cb on cb.collective_id = ca.collective_id
      join public.group_members b on b.group_id = cb.group_id
      where a.user_id = auth.uid() and b.user_id = other
    );
$$;

-- A group's standings are visible to its members and to anyone in a collective it's in.
create function public.can_view_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_group_member(gid) or exists (
    select 1 from public.collective_groups cg
    where cg.group_id = gid and public.in_collective(cg.collective_id)
  );
$$;

-- Names/avatars now visible to everyone you can see on a leaderboard.
drop policy "profiles: read self or groupmates" on public.profiles;
create policy "profiles: read leaderboard peers" on public.profiles
  for select to authenticated
  using (public.shares_leaderboard_with(id));

-------------------------------------------------------------------------------
-- Leaderboards
-------------------------------------------------------------------------------
drop function public.group_leaderboard(uuid, date);

create function public.group_leaderboard(
  p_group_id uuid,
  p_from     date default null,
  p_to       date default null
)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  role          text,
  focus_seconds bigint,
  sessions      bigint
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

-- Ranks groups. A person in two groups of the same collective counts toward both.
create function public.collective_leaderboard(
  p_collective_id uuid,
  p_from          date default null,
  p_to            date default null
)
returns table (
  group_id      uuid,
  group_name    text,
  members       bigint,
  focus_seconds bigint,
  sessions      bigint
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

-------------------------------------------------------------------------------
-- Profile heatmap: daily totals for someone you share a leaderboard with
-------------------------------------------------------------------------------
create function public.profile_activity(p_user_id uuid, p_from date, p_to date)
returns table (day_key date, focus_seconds bigint, sessions bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.shares_leaderboard_with(p_user_id) then raise exception 'not allowed'; end if;
  return query
    select s.day_key, sum(s.focused_seconds)::bigint, count(*)
    from public.focus_sessions s
    where s.user_id = p_user_id and s.day_key between p_from and p_to
    group by s.day_key
    order by s.day_key;
end;
$$;

revoke execute on function public.shares_leaderboard_with(uuid)                from public, anon;
revoke execute on function public.can_view_group(uuid)                         from public, anon;
revoke execute on function public.group_leaderboard(uuid, date, date)          from public, anon;
revoke execute on function public.collective_leaderboard(uuid, date, date)     from public, anon;
revoke execute on function public.profile_activity(uuid, date, date)           from public, anon;
grant  execute on function public.shares_leaderboard_with(uuid)                to authenticated;
grant  execute on function public.can_view_group(uuid)                         to authenticated;
grant  execute on function public.group_leaderboard(uuid, date, date)          to authenticated;
grant  execute on function public.collective_leaderboard(uuid, date, date)     to authenticated;
grant  execute on function public.profile_activity(uuid, date, date)           to authenticated;
