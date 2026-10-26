-- The shared @profullstack/profile fields (email, first_name, last_name,
-- company_domain, job_title, linkedin_url) in the package's own table.
--
-- Not on public.profiles: that table has NOT NULL referral_code with no
-- default (the package upserts) and an owner-update RLS policy. This table
-- is server-only: RLS on with NO anon/authenticated policies, so only the
-- service role (lib/profile.ts) reads or writes it.
--
-- dev2 self-hosted Supabase has no automatic migration step. Apply by hand:
--   docker exec -i sh1pt-com-supabase-db psql -U postgres -d postgres -1 < this file
--   then: notify pgrst, 'reload schema';
-- Additive only, safe before the deploy. No backfill: profiles has only a
-- handle, never a person's name.

create table if not exists "user_profiles" (
  "user_id" uuid primary key references auth.users(id) on delete cascade,
  "email" text,
  "first_name" text,
  "last_name" text,
  "company_domain" text,
  "job_title" text,
  "linkedin_url" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index if not exists "user_profiles_email" on "user_profiles" (lower("email"));
create index if not exists "user_profiles_company_domain" on "user_profiles" ("company_domain");

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;
