-- Sign in with CoinPay. CoinPay is the fleet's master account.
--
-- An account is bound to a CoinPay identity by its `sub` (STANDING rule):
-- never looked up by the CoinPay email, which CoinPay does not verify, and that
-- email is never written to auth.users. A first CoinPay login with nothing
-- linked makes a NEW account on a placeholder address; connecting CoinPay to an
-- existing account happens only from its dashboard, signed in.
--
-- Server-only: RLS on with no policies, and no grants to anon/authenticated.
-- The app reads and writes these with the service role.

create table if not exists public.coinpay_identities (
  coinpay_sub   text primary key,
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  coinpay_email text,
  coinpay_name  text,
  created_via   text not null check (created_via in ('connect', 'signup')),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- One row per authorization request in flight, keyed by sha256(state). The
-- PKCE verifier and nonce never leave the server; the callback deletes the
-- row, so a state works once.
create table if not exists public.coinpay_pending (
  id           text primary key,
  verifier     text not null,
  nonce        text not null,
  mode         text not null check (mode in ('login', 'connect')),
  next_path    text not null,
  link_user_id uuid,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists coinpay_pending_expires_idx on public.coinpay_pending (expires_at);

alter table public.coinpay_identities enable row level security;
alter table public.coinpay_pending enable row level security;
revoke all on public.coinpay_identities from anon, authenticated;
revoke all on public.coinpay_pending from anon, authenticated;
