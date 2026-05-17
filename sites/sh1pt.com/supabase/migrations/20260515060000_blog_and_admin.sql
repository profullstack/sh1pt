-- Crawlproof Autoblog integration: admin gate + blog tables.
--
-- sh1pt.com doesn't have an Outrank flow (other Profullstack sites do),
-- so this scaffolds the blog from scratch with Crawlproof as the only
-- source. The kind column is still here for forward-compat — flipping
-- on additional sources later is one INSERT, not a schema migration.

-- ============================================================
-- 1. Admin gate on profiles
-- ============================================================
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ============================================================
-- 2. blog_integrations: per-source bearer-token store
-- ============================================================
create table if not exists public.blog_integrations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  kind text not null default 'crawlproof'
    check (kind in ('crawlproof')),
  access_token text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  request_count integer not null default 0
);

create index if not exists idx_blog_integrations_token
  on public.blog_integrations (access_token);
create index if not exists idx_blog_integrations_kind
  on public.blog_integrations (kind);

alter table public.blog_integrations enable row level security;

drop policy if exists "Service role full access on blog_integrations"
  on public.blog_integrations;
create policy "Service role full access on blog_integrations"
  on public.blog_integrations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 3. blog_posts: ingested articles
-- ============================================================
create table if not exists public.blog_posts (
  id uuid default gen_random_uuid() primary key,
  source text not null default 'crawlproof',
  source_id text,
  slug text not null,
  title text not null,
  content_markdown text,
  content_html text,
  meta_description text,
  image_url text,
  tags text[] not null default '{}',
  source_created_at timestamptz,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create unique index if not exists idx_blog_posts_slug on public.blog_posts (slug);
create index if not exists idx_blog_posts_published_at
  on public.blog_posts (published_at desc);
create index if not exists idx_blog_posts_tags
  on public.blog_posts using gin (tags);

alter table public.blog_posts enable row level security;

drop policy if exists "Anyone can read blog posts" on public.blog_posts;
create policy "Anyone can read blog posts"
  on public.blog_posts
  for select
  using (true);

drop policy if exists "Service role can write blog posts" on public.blog_posts;
create policy "Service role can write blog posts"
  on public.blog_posts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 4. Atomic counter bump for the webhook
-- ============================================================
create or replace function public.bump_blog_integration(integration_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.blog_integrations
     set last_used_at = now(),
         request_count = request_count + 1
   where id = integration_id;
$$;
revoke execute on function public.bump_blog_integration(uuid)
  from public, anon, authenticated;
grant execute on function public.bump_blog_integration(uuid) to service_role;
