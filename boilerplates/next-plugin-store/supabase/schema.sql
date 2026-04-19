-- Run once in your Supabase project's SQL editor.
-- Customise before shipping — this is the starter schema, not the final one.

create table if not exists publishers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  handle text unique not null,
  display_name text,
  payout_connected boolean default false,
  stripe_connect_id text,
  created_at timestamptz default now()
);

create table if not exists plugins (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid references publishers(id) on delete cascade not null,
  publisher_handle text not null,
  slug text unique not null,
  name text not null,
  tagline text,
  description_md text,
  price_cents integer,                              -- null = free
  status text not null default 'draft',             -- draft | submitted | approved | suspended
  downloads integer not null default 0,
  rating_avg numeric(3,2),
  rating_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists plugin_versions (
  id uuid primary key default gen_random_uuid(),
  plugin_id uuid references plugins(id) on delete cascade not null,
  version text not null,                            -- semver
  artifact_url text not null,                       -- signed URL in Supabase Storage
  checksum text not null,
  changelog_md text,
  published_at timestamptz default now(),
  unique (plugin_id, version)
);

create table if not exists installs (
  id uuid primary key default gen_random_uuid(),
  plugin_id uuid references plugins(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  license_key text unique not null,
  purchased boolean not null default false,
  price_paid_cents integer,
  stripe_payment_intent text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  plugin_id uuid references plugins(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  body text,
  created_at timestamptz default now(),
  unique (plugin_id, user_id)
);

-- RLS
alter table publishers enable row level security;
alter table plugins enable row level security;
alter table plugin_versions enable row level security;
alter table installs enable row level security;
alter table reviews enable row level security;

create policy "publishers are viewable by everyone" on publishers for select using (true);
create policy "publishers insert as self" on publishers for insert with check (auth.uid() = user_id);
create policy "publishers update self" on publishers for update using (auth.uid() = user_id);

create policy "approved plugins are public" on plugins for select using (status = 'approved' or publisher_id in (select id from publishers where user_id = auth.uid()));
create policy "publisher writes own plugins" on plugins for all using (publisher_id in (select id from publishers where user_id = auth.uid())) with check (publisher_id in (select id from publishers where user_id = auth.uid()));

create policy "version read matches plugin read" on plugin_versions for select using (plugin_id in (select id from plugins where status = 'approved' or publisher_id in (select id from publishers where user_id = auth.uid())));

create policy "installs readable by buyer and publisher" on installs for select using (user_id = auth.uid() or plugin_id in (select id from plugins where publisher_id in (select id from publishers where user_id = auth.uid())));

create policy "reviews viewable by everyone" on reviews for select using (true);
create policy "review own" on reviews for insert with check (auth.uid() = user_id);
