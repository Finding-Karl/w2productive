-- A user belongs to at most one group. (Groups can still be in several collectives.)
create unique index group_members_one_group_per_user on public.group_members (user_id);

create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.group_members where user_id = auth.uid()) then
    raise exception 'You''re already in a group. Leave it first.';
  end if;
  insert into public.groups (name, owner_id) values (trim(p_name), auth.uid()) returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'owner');
  return g;
end;
$$;

create or replace function public.join_group(p_invite_code text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into g from public.groups where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'invalid invite code'; end if;
  if exists (select 1 from public.group_members where user_id = auth.uid() and group_id <> g.id) then
    raise exception 'You''re already in a group. Leave it first.';
  end if;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid())
    on conflict do nothing;
  return g;
end;
$$;

-- Owners can't leave their own group, so they need a way out: delete it.
-- Cascades to members, the group's list entries and its collective memberships.
create policy "groups: owner delete" on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()));
