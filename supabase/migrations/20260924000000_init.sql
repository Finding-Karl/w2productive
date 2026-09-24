-- Focus extension: initial schema.
--
-- Design notes
-- * The extension is offline-first: chrome.storage is the working copy, this DB is the
--   synced copy. Rows are created on the client with client-generated UUIDs, so pushes
--   are idempotent upserts and multiple devices merge without conflicts.
-- * credit_events is an append-only ledger. Balance = sum(amount_seconds). No updates,
--   no deletes: corrections are new 'adjust' events.
-- * Only aggregates live here (sessions, credit). Per-domain browsing time never syncs.
-- * Stats are self-reported (no anti-cheat), so RLS only guarantees users can write
--   their own rows and read what their groups are allowed to see.

-------------------------------------------------------------------------------
-- Profiles (1:1 with auth.users, created by trigger on sign-up)
-------------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ), 60),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- Groups (phase 2 groundwork: private groups joined by invite code)
-------------------------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

-- SECURITY DEFINER helpers so RLS policies on group_members don't recurse into themselves.
create function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create function public.shares_group_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b using (group_id)
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-------------------------------------------------------------------------------
-- Focus sessions (one row per finished session, synced from the client log)
-------------------------------------------------------------------------------
create table public.focus_sessions (
  id                    uuid primary key, -- client-generated
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_key               date not null,    -- local day incl. rollover hour, computed on client
  started_at            timestamptz not null,
  ended_at              timestamptz not null,
  planned_minutes       int not null check (planned_minutes between 1 and 240),
  focused_seconds       int not null check (focused_seconds >= 0),
  outcome               text not null check (outcome in ('completed', 'ended_early')),
  credit_earned_seconds int not null check (credit_earned_seconds >= 0),
  block_hits            int not null default 0 check (block_hits >= 0),
  hardcore              boolean not null default false,
  updated_at            timestamptz not null,
  created_at            timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index focus_sessions_user_day_idx on public.focus_sessions (user_id, day_key);

-------------------------------------------------------------------------------
-- Credit ledger (append-only)
-------------------------------------------------------------------------------
create table public.credit_events (
  id             uuid primary key, -- client-generated
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind           text not null check (kind in (
                   'session_earn', 'spend', 'break_glass',
                   'vault_deposit', 'vault_withdraw', 'adjust'
                 )),
  amount_seconds int not null,          -- signed: earn > 0, spend < 0
  occurred_at    timestamptz not null,  -- client clock
  session_id     uuid,                  -- for session_earn
  device_id      text,
  created_at     timestamptz not null default now() -- server clock; used as the pull cursor
);
create index credit_events_user_created_idx on public.credit_events (user_id, created_at);

create view public.credit_balances
with (security_invoker = true) as
  select user_id, coalesce(sum(amount_seconds), 0)::bigint as balance_seconds
  from public.credit_events
  group by user_id;

-------------------------------------------------------------------------------
-- Row-level security
-------------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.credit_events  enable row level security;

-- profiles: see yourself and people you share a group with; edit only yourself.
create policy "profiles: read self or groupmates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- groups: members can read; owner can rename. Create/join go through RPCs below.
create policy "groups: members read" on public.groups
  for select to authenticated using (public.is_group_member(id));
create policy "groups: owner update" on public.groups
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- group_members: members see the roster; anyone can leave (delete own row).
create policy "group_members: members read" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "group_members: leave" on public.group_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- focus_sessions: own rows only. Groupmates see aggregates via group_leaderboard().
create policy "focus_sessions: read own" on public.focus_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "focus_sessions: insert own" on public.focus_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "focus_sessions: update own" on public.focus_sessions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- credit_events: own rows, insert-only (no update/delete policies => denied).
create policy "credit_events: read own" on public.credit_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "credit_events: insert own" on public.credit_events
  for insert to authenticated with check (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- RPCs
-------------------------------------------------------------------------------
create function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.groups (name, owner_id) values (trim(p_name), auth.uid()) returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'owner');
  return g;
end;
$$;

create function public.join_group(p_invite_code text)
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
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid())
    on conflict do nothing;
  return g;
end;
$$;

-- Weekly focus leaderboard for one group. Ranks on focus time, never credit
-- (earn ratios differ per user).
create function public.group_leaderboard(p_group_id uuid, p_week_start date)
returns table (
  user_id        uuid,
  display_name   text,
  avatar_url     text,
  focus_seconds  bigint,
  sessions       bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(p_group_id) then raise exception 'not a member'; end if;
  return query
    select m.user_id, p.display_name, p.avatar_url,
           coalesce(sum(s.focused_seconds), 0)::bigint,
           count(s.id)
    from public.group_members m
    left join public.profiles p on p.id = m.user_id
    left join public.focus_sessions s
      on s.user_id = m.user_id
     and s.day_key >= p_week_start
     and s.day_key <  p_week_start + 7
    where m.group_id = p_group_id
    group by m.user_id, p.display_name, p.avatar_url
    order by 4 desc;
end;
$$;

-- Functions are executable by PUBLIC by default; limit them to signed-in users.
revoke execute on function public.create_group(text)             from public, anon;
revoke execute on function public.join_group(text)               from public, anon;
revoke execute on function public.group_leaderboard(uuid, date)  from public, anon;
revoke execute on function public.handle_new_user()              from public, anon, authenticated;
grant  execute on function public.create_group(text)             to authenticated;
grant  execute on function public.join_group(text)               to authenticated;
grant  execute on function public.group_leaderboard(uuid, date)  to authenticated;
