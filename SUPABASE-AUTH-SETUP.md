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
