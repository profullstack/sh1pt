-- sh1pt.com waitlist + referrals schema. Run once in the Supabase SQL
-- editor of the project that backs sh1pt.dev.

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  handle text,
  referred_by text,                             -- referral code of the inviter, if any
  referral_code text unique not null,
  prepaid boolean not null default false,
  price_cents integer,
  payment_provider text,                        -- 'coinpay' | 'stripe' | ...
  created_at timestamptz default now()
);

create index if not exists waitlist_referred_by_idx on waitlist(referred_by);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_email text references waitlist(email) on delete cascade,
  invitee_email text references waitlist(email) on delete cascade,
  credit_cents integer not null default 5000,   -- $50
  credited_at timestamptz,                      -- null until the invitee pays
  created_at timestamptz default now(),
  unique (inviter_email, invitee_email)
);

alter table waitlist enable row level security;
alter table referrals enable row level security;

-- Writes happen server-side via the service role; anon clients should
-- only be able to look up their own row by email (rarely needed).
create policy "anon can read own waitlist row" on waitlist
  for select using (auth.jwt()->>'email' = email);
