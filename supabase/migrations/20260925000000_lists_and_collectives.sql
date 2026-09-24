-- Groups & collectives with shared block/allow lists.
--
-- Hierarchy: user -> groups (many) -> collectives (many).
-- A member's effective lists = their own + every group they're in + every collective
-- those groups belong to. Blocks from any level always win over allows (enforced on
-- the client when building DNR rules; see src/core/lists.ts).
--
-- Editing: group lists by the group's owner/admins; collective lists by the
-- collective's owner/admins. Leaving takes effect immediately.

-------------------------------------------------------------------------------
-- Group roles: owner | admin | member
-------------------------------------------------------------------------------
alter table public.group_members drop constraint group_members_role_check;
alter table public.group_members
  add constraint group_members_role_check check (role in ('owner', 'admin', 'member'));

create function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

-- Owners can't just leave (the group would be orphaned); admins can remove non-owners.
drop policy "group_members: leave" on public.group_members;
create policy "group_members: leave" on public.group_members
  for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'owner');
create policy "group_members: admins remove" on public.group_members
  for delete to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner');

-------------------------------------------------------------------------------
-- Collectives
-------------------------------------------------------------------------------
create table public.collectives (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- The people who manage a collective (independent of which groups are in it).
create table public.collective_admins (
  collective_id uuid not null references public.collectives (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'admin' check (role in ('owner', 'admin')),
  added_at      timestamptz not null default now(),
  primary key (collective_id, user_id)
);

-- Groups that belong to a collective.
create table public.collective_groups (
  collective_id uuid not null references public.collectives (id) on delete cascade,
  group_id      uuid not null references public.groups (id) on delete cascade,
  joined_by     uuid references auth.users (id) on delete set null,
  joined_at     timestamptz not null default now(),
  primary key (collective_id, group_id)
);
create index collective_groups_group_id_idx on public.collective_groups (group_id);

create function public.is_collective_admin(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collective_admins
    where collective_id = cid and user_id = auth.uid()
  );
$$;

-- Admins, plus anyone in a group that belongs to the collective.
create function public.in_collective(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_collective_admin(cid) or exists (
    select 1
    from public.collective_groups cg
    join public.group_members gm on gm.group_id = cg.group_id
    where cg.collective_id = cid and gm.user_id = auth.uid()
  );
$$;

alter table public.collectives       enable row level security;
alter table public.collective_admins enable row level security;
alter table public.collective_groups enable row level security;

create policy "collectives: members read" on public.collectives
  for select to authenticated using (public.in_collective(id));
create policy "collectives: admins rename" on public.collectives
  for update to authenticated
  using (public.is_collective_admin(id)) with check (public.is_collective_admin(id));

create policy "collective_admins: members read" on public.collective_admins
  for select to authenticated using (public.in_collective(collective_id));

create policy "collective_groups: members read" on public.collective_groups
  for select to authenticated using (public.in_collective(collective_id));
-- A group's admins can take it out; the collective's admins can remove a group.
create policy "collective_groups: leave or remove" on public.collective_groups
  for delete to authenticated
  using (public.is_group_admin(group_id) or public.is_collective_admin(collective_id));

-------------------------------------------------------------------------------
-- Shared list entries (one table for both levels)
-------------------------------------------------------------------------------
create table public.list_entries (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references public.groups (id) on delete cascade,
  collective_id uuid references public.collectives (id) on delete cascade,
  list          text not null check (list in ('block', 'allow')),
  domain        text not null check (domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' and char_length(domain) <= 253),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (num_nonnulls(group_id, collective_id) = 1)
);
create unique index list_entries_group_uniq
  on public.list_entries (group_id, list, domain) where group_id is not null;
create unique index list_entries_collective_uniq
  on public.list_entries (collective_id, list, domain) where collective_id is not null;

alter table public.list_entries enable row level security;

create policy "list_entries: members read" on public.list_entries
  for select to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or (collective_id is not null and public.in_collective(collective_id))
  );
create policy "list_entries: admins add" on public.list_entries
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (group_id is not null and public.is_group_admin(group_id))
      or (collective_id is not null and public.is_collective_admin(collective_id))
    )
  );
create policy "list_entries: admins remove" on public.list_entries
  for delete to authenticated
  using (
    (group_id is not null and public.is_group_admin(group_id))
    or (collective_id is not null and public.is_collective_admin(collective_id))
  );

-------------------------------------------------------------------------------
-- RPCs
-------------------------------------------------------------------------------

-- Owner promotes/demotes admins.
create function public.set_group_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role not in ('admin', 'member') then raise exception 'role must be admin or member'; end if;
  if not exists (select 1 from public.groups where id = p_group_id and owner_id = auth.uid()) then
    raise exception 'only the group owner can change roles';
  end if;
  update public.group_members set role = p_role
    where group_id = p_group_id and user_id = p_user_id and role <> 'owner';
end;
$$;

-- Create a collective owned by the caller, with one of their groups as its first member.
create function public.create_collective(p_name text, p_group_id uuid)
returns public.collectives
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.collectives;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_group_admin(p_group_id) then raise exception 'must be an admin of that group'; end if;
  insert into public.collectives (name, owner_id) values (trim(p_name), auth.uid()) returning * into c;
  insert into public.collective_admins (collective_id, user_id, role) values (c.id, auth.uid(), 'owner');
  insert into public.collective_groups (collective_id, group_id, joined_by) values (c.id, p_group_id, auth.uid());
  return c;
end;
$$;

-- A group admin brings their group into a collective by its invite code.
create function public.join_collective(p_invite_code text, p_group_id uuid)
returns public.collectives
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.collectives;
begin
  if not public.is_group_admin(p_group_id) then raise exception 'must be an admin of that group'; end if;
  select * into c from public.collectives where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'invalid invite code'; end if;
  insert into public.collective_groups (collective_id, group_id, joined_by)
    values (c.id, p_group_id, auth.uid())
    on conflict do nothing;
  return c;
end;
$$;

-- Collective owner adds/removes collective admins (must already be in the collective).
create function public.set_collective_admin(p_collective_id uuid, p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.collectives where id = p_collective_id and owner_id = auth.uid()) then
    raise exception 'only the collective owner can manage admins';
  end if;
  if p_is_admin then
    if not exists (
      select 1 from public.collective_groups cg
      join public.group_members gm on gm.group_id = cg.group_id
      where cg.collective_id = p_collective_id and gm.user_id = p_user_id
    ) then raise exception 'user is not in this collective'; end if;
    insert into public.collective_admins (collective_id, user_id) values (p_collective_id, p_user_id)
      on conflict do nothing;
  else
    delete from public.collective_admins
      where collective_id = p_collective_id and user_id = p_user_id and role <> 'owner';
  end if;
end;
$$;

-- Names of the groups in the caller's collectives. (groups RLS only exposes your own
-- groups, and group rows carry invite codes, so peers get names via this instead.)
create function public.my_collective_groups()
returns table (collective_id uuid, group_id uuid, group_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select cg.collective_id, g.id, g.name
  from public.collective_groups cg
  join public.groups g on g.id = cg.group_id
  where public.in_collective(cg.collective_id);
$$;

-- Everything the caller inherits, flattened, for the extension to cache and enforce.
create function public.my_inherited_list_entries()
returns table (source text, source_id uuid, source_name text, list text, domain text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'group', g.id, g.name, e.list, e.domain
  from public.group_members m
  join public.groups g on g.id = m.group_id
  join public.list_entries e on e.group_id = g.id
  where m.user_id = auth.uid()
  union
  select 'collective', c.id, c.name, e.list, e.domain
  from public.group_members m
  join public.collective_groups cg on cg.group_id = m.group_id
  join public.collectives c on c.id = cg.collective_id
  join public.list_entries e on e.collective_id = c.id
  where m.user_id = auth.uid();
$$;

revoke execute on function public.set_group_role(uuid, uuid, text)              from public, anon;
revoke execute on function public.create_collective(text, uuid)                 from public, anon;
revoke execute on function public.join_collective(text, uuid)                   from public, anon;
revoke execute on function public.set_collective_admin(uuid, uuid, boolean)     from public, anon;
revoke execute on function public.my_collective_groups()                        from public, anon;
revoke execute on function public.my_inherited_list_entries()                   from public, anon;
grant  execute on function public.set_group_role(uuid, uuid, text)              to authenticated;
grant  execute on function public.create_collective(text, uuid)                 to authenticated;
grant  execute on function public.join_collective(text, uuid)                   to authenticated;
grant  execute on function public.set_collective_admin(uuid, uuid, boolean)     to authenticated;
grant  execute on function public.my_collective_groups()                        to authenticated;
grant  execute on function public.my_inherited_list_entries()                   to authenticated;
