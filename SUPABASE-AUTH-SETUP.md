# Supabase Auth + Secure LLM Key Storage — Setup Steps

This adds real sign-in (Supabase Auth) so LLM API keys can safely follow you
across devices, instead of only living in one browser's localStorage.

## 0. Create the `conversations` table (if you see a 404 / "Could not find the table 'public.conversations'")

`lib/storage.ts` only ever reads/writes a single `conversations` table (the
separate `agents`/`messages` tables from an earlier draft of this schema are
no longer used by the app). If that table doesn't exist yet, conversations
silently fall back to localStorage-only — run this once to fix it:

```sql
create table conversations (
  id text primary key,
  agents jsonb not null,
  threads jsonb not null,
  messages jsonb not null,
  settings jsonb not null,
  flow text not null default 'FreeFlowing',
  status text not null default 'idle',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_conversations_updated_at on conversations(updated_at desc);

alter table conversations enable row level security;

create policy "Public read access for conversations"
  on conversations for select
  using (true);

create policy "Public write access for conversations"
  on conversations for insert
  with check (true);

create policy "Public update access for conversations"
  on conversations for update
  using (true);

create policy "Public delete access for conversations"
  on conversations for delete
  using (true);
```

Note `id` is `text`, not `uuid` — `lib/id.ts` generates ids via
`crypto.randomUUID()` where available but falls back to a non-UUID string
format on older browsers, so a `uuid` column would reject those. This table
still uses public `USING (true)` policies (see "What's still public" at the
bottom of this file) — anyone with the anon key can read/write it, same as
the original `DEPLOYMENT.md` design. Lock it down with `user_id` + RLS later
if that becomes a concern.

## 1. Run this SQL in Supabase SQL Editor

<https://supabase.com/dashboard/project/ivotsmwlsubvudlrylbf/sql/new>

```sql
create table llm_connections (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null,
  model text not null,
  effort text not null,
  api_key text not null,
  label text not null,
  updated_at timestamptz default now()
);

alter table llm_connections enable row level security;

create policy "Users manage their own LLM connections"
  on llm_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

That last policy is the important part: it restricts every read/write to
rows owned by the signed-in user, so API keys are never visible to anyone
else — unlike the `conversations`/`agents`/`messages` tables from the
original setup, which still use public `USING (true)` policies.

## 1b. Run this SQL too — user approval / super-admin

New sign-ups are unusable until an admin activates them. `trimakassi@gmail.com`
is auto-provisioned as the super admin the moment that account is created.

```sql
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  is_approved boolean not null default false,
  created_at timestamptz default now()
);

alter table user_profiles enable row level security;

create policy "Users read their own profile"
  on user_profiles for select
  using (auth.uid() = user_id);

-- SECURITY DEFINER: bypasses RLS internally so this check doesn't
-- re-trigger the same policy on user_profiles (which would cause
-- "infinite recursion detected in policy" otherwise).
create function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from user_profiles where user_id = uid), false);
$$;

create policy "Admins read all profiles"
  on user_profiles for select
  using (public.is_admin(auth.uid()));

create policy "Admins update all profiles"
  on user_profiles for update
  using (public.is_admin(auth.uid()));

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (user_id, email, is_admin, is_approved)
  values (
    new.id,
    new.email,
    new.email = 'trimakassi@gmail.com',
    new.email = 'trimakassi@gmail.com'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Every new sign-up gets a `user_profiles` row with `is_approved = false`,
except `trimakassi@gmail.com`, which is auto-approved and marked admin. The
🛡️ icon in the account bar opens the admin panel (pending requests +
activate/deactivate) once signed in as that account. Everyone else sees an
"Awaiting Approval" screen until the admin activates them.

## 1c. Backfill the super-admin if you already signed up

The trigger above only fires for *new* sign-ups. If `trimakassi@gmail.com`
was created before you ran the SQL in step 1b, run this once to retroactively
grant admin + approval (safe to re-run any time):

```sql
insert into user_profiles (user_id, email, is_admin, is_approved)
select id, email, true, true
from auth.users
where email = 'trimakassi@gmail.com'
on conflict (user_id) do update set is_admin = true, is_approved = true;
```

If sign-in still shows "Awaiting Approval" after running this, sign out and
back in (or refresh) so the app re-fetches the profile.

## 1d. Fix "infinite recursion detected in policy" error

If you already ran the original version of step 1b, its admin policies had a
bug: they checked admin status with a subquery on `user_profiles` from
*inside* a policy on `user_profiles`, which Postgres re-evaluates forever.
Run this to replace just the two broken policies (safe — doesn't touch your
table or data):

```sql
drop policy if exists "Admins read all profiles" on user_profiles;
drop policy if exists "Admins update all profiles" on user_profiles;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from user_profiles where user_id = uid), false);
$$;

create policy "Admins read all profiles"
  on user_profiles for select
  using (public.is_admin(auth.uid()));

create policy "Admins update all profiles"
  on user_profiles for update
  using (public.is_admin(auth.uid()));
```

Then re-run the section 1c backfill (it's idempotent) and reload the app.

## 1e. Track the current conversation per-account

So opening the app on a different device/browser resumes the same
conversation instead of starting a new blank one:

```sql
alter table user_profiles add column if not exists current_conversation_id text;
```

## 2. Confirm email/password auth is enabled

Supabase Dashboard → **Authentication → Providers → Email** — it's on by
default. If you don't want an email-confirmation step slowing down sign-up,
you can toggle **Confirm email** off there (dev-friendly, less secure).

## 3. Create your account in the app

Open the deployed app → you'll land on a sign-in screen → click
**"Need an account? Sign up"** → use your email with a fresh password you
haven't used or shared anywhere else before (any password typed into a chat
session should be treated as compromised and never reused). You can change
your password anytime from the ⚙️ icon in the account bar once signed in.

## What's still public

The `conversations`, `agents`, and `messages` tables from the original
`DEPLOYMENT.md` setup still allow public read/write — that was fine when
they only held conversation transcripts, but if you want those locked to
your account too, that's a follow-up (add `user_id` columns + matching RLS
policies, same pattern as above).
