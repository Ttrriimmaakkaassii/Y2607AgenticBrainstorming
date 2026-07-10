# Supabase Auth + Secure LLM Key Storage — Setup Steps

This adds real sign-in (Supabase Auth) so LLM API keys can safely follow you
across devices, instead of only living in one browser's localStorage.

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

create policy "Admins read all profiles"
  on user_profiles for select
  using (exists (
    select 1 from user_profiles p where p.user_id = auth.uid() and p.is_admin
  ));

create policy "Admins update all profiles"
  on user_profiles for update
  using (exists (
    select 1 from user_profiles p where p.user_id = auth.uid() and p.is_admin
  ));

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
