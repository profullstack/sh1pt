-- sh1pt Actions Fleet: per-user GitHub App installations + selected repos.
--
-- Platform-level App credentials (app_id, private key, client id/secret,
-- webhook secret) live in Railway env vars, NOT in the DB. They're set
-- via the App Manifest flow at /admin/github/setup — see
-- sites/sh1pt.com/lib/github-app.ts for the manifest conversion.
--
--  1) github_installations — per-user records of GitHub App installations on
--     orgs/users. Created when a user lands on the post-install callback.
--  2) github_installation_repos — repos selected by the user inside an
--     installation. Selection is independent of the installation's GitHub
--     repository_selection setting; this lets users opt-in repo-by-repo.

-- ============================================================
-- 1. github_installations: per-user installation records
-- ============================================================
create table if not exists public.github_installations (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  installation_id bigint not null,
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  account_avatar_url text,
  repository_selection text not null default 'selected'
    check (repository_selection in ('all', 'selected')),
  permissions jsonb,
  -- mirrors GitHub's lifecycle: active until the user uninstalls.
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, installation_id)
);

create index if not exists idx_github_installations_profile
  on public.github_installations (profile_id);
create index if not exists idx_github_installations_installation
  on public.github_installations (installation_id);

alter table public.github_installations enable row level security;

drop policy if exists "Service role full access on github_installations"
  on public.github_installations;
create policy "Service role full access on github_installations"
  on public.github_installations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 2. github_installation_repos: per-user repo picks
-- ============================================================
create table if not exists public.github_installation_repos (
  id uuid default gen_random_uuid() primary key,
  installation_pk uuid not null references public.github_installations(id) on delete cascade,
  github_repo_id bigint not null,
  owner text not null,
  name text not null,
  full_name text not null,
  private boolean not null default false,
  default_branch text,
  archived boolean not null default false,
  selected_at timestamptz not null default now(),
  unique (installation_pk, github_repo_id)
);

create index if not exists idx_github_installation_repos_installation
  on public.github_installation_repos (installation_pk);
create index if not exists idx_github_installation_repos_full_name
  on public.github_installation_repos (full_name);

alter table public.github_installation_repos enable row level security;

drop policy if exists "Service role full access on github_installation_repos"
  on public.github_installation_repos;
create policy "Service role full access on github_installation_repos"
  on public.github_installation_repos
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
