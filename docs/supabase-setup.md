# Supabase setup

The extension works fully locally without any of this. These steps enable Google
sign-in and credit/session sync.

Extension ID (fixed by `manifest.key` in `wxt.config.ts`): `gdhfabadbkagblhlimnicelhnbkonddf`
OAuth redirect URL: `https://gdhfabadbkagblhlimnicelhnbkonddf.chromiumapp.org/`

## 1. Create the project

1. supabase.com → New project (free tier is fine). Pick a region near you.
2. **Project Settings → API**: copy the Project URL and the anon / publishable key.
3. In the repo: `cp .env.example .env` and paste both values. Restart `npm run dev`
   (env vars are read at build time).

## 2. Apply the schema

Either:

- **SQL editor**: run each file in `supabase/migrations/` in filename order, or
- **CLI**: `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`

Creates `profiles`, `focus_sessions`, `credit_events` (+ `credit_balances` view),
`groups` / `group_members`, `collectives` / `collective_admins` / `collective_groups`,
`list_entries` (shared block/allow lists), RLS policies, and RPCs for creating/joining
groups and collectives, roles, the weekly leaderboard, and `my_inherited_list_entries`.

## 3. Google OAuth client

1. console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen**: External, app name, your email.
   While in "Testing", add your Google account under Test users.
3. **Credentials → Create credentials → OAuth client ID**, type **Web application**.
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the client ID and secret.

(The chromiumapp.org URL does *not* go here — Google redirects to Supabase, and
Supabase redirects to the extension.)

## 4. Wire Google into Supabase

1. **Authentication → Sign In / Providers → Google**: enable, paste client ID + secret.
2. **Authentication → URL Configuration → Redirect URLs**: add
   `https://gdhfabadbkagblhlimnicelhnbkonddf.chromiumapp.org/**`

## 5. Try it

1. Reload the extension. Its ID in `chrome://extensions` should be
   `gdhfabadbkagblhlimnicelhnbkonddf`. (Adding the key changed the ID, so this is a
   fresh install — earlier local test data isn't carried over.)
2. Settings → Account & sync → **Sign in with Google**.
3. Finish a session, then check **Table editor → credit_events / focus_sessions**.

## How sync works

- chrome.storage is the working copy; the extension never waits on the network to
  start, stop, block or (later) spend credit.
- Every session and credit change gets a client UUID and goes into an outbox.
  Sync pushes the outbox (idempotent upserts), then pulls rows newer than a
  server-time cursor and merges by id. Runs after each session, every 15 min, on
  browser start, and on "Sync now".
- Credit is a ledger: `balance = sum(amount_seconds)`. Rows are never updated or
  deleted, so two devices can't conflict.
- Sign-out keeps local data. Signing into a *different* account uploads any
  un-synced local changes to that account.
