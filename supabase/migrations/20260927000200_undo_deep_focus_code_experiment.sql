-- Undo a short-lived "collect a code" deep focus experiment that was applied to the hosted
-- project but never kept in this repo. Everything is IF EXISTS / idempotent, so on a
-- database built from these migrations this is a no-op.

alter table public.groups      drop column if exists deep_focus_max_code_length;
alter table public.collectives drop column if exists deep_focus_max_code_length;

-- Restore end reasons to what the extension writes. (Relabel any rows the experiment wrote.)
update public.focus_sessions set end_reason = 'stopped' where end_reason in ('code_wrong', 'code_expired');
alter table public.focus_sessions drop constraint if exists focus_sessions_end_reason_check;
alter table public.focus_sessions add constraint focus_sessions_end_reason_check
  check (end_reason in ('completed', 'stopped', 'missed_check'));

-- Restore the 5-argument set_deep_focus_rules and the 6-column my_deep_focus_rules.
drop function if exists public.set_deep_focus_rules(text, uuid, int, int, int, int);
drop function if exists public.set_deep_focus_rules(text, uuid, int, int, int);
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

drop function if exists public.my_deep_focus_rules();
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

revoke execute on function public.set_deep_focus_rules(text, uuid, int, int, int) from public, anon;
revoke execute on function public.my_deep_focus_rules()                           from public, anon;
grant  execute on function public.set_deep_focus_rules(text, uuid, int, int, int) to authenticated;
grant  execute on function public.my_deep_focus_rules()                           to authenticated;
