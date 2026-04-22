-- Switch referrals to uuid foreign keys instead of email.
--
-- Old shape: referrals.inviter_email / invitee_email (text, FK on waitlist.email)
-- New shape: referrals.referred_by / referred_to (uuid, FK on waitlist.id)
--
-- Cleaner join semantics, survives email changes, and reads more naturally:
-- "this referral was referred_by <uuid> referred_to <uuid>".
--
-- Zero data at the time of this migration (nobody has actually been
-- referred yet — the waitlist action wasn't inserting into referrals),
-- so we drop + recreate rather than a painful column-add + backfill.

drop table if exists referrals;

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referred_by uuid not null references waitlist(id) on delete cascade,
  referred_to uuid not null references waitlist(id) on delete cascade,
  credit_cents integer not null default 5000,                   -- $50 default
  credited_at timestamptz,                                      -- null until invitee pays
  created_at timestamptz default now(),
  unique (referred_by, referred_to)
);

create index if not exists referrals_referred_by_idx on referrals(referred_by);
create index if not exists referrals_referred_to_idx on referrals(referred_to);

alter table referrals enable row level security;

-- Inviter sees their own referral history once Supabase auth is wired.
-- Matches the waitlist policy pattern (auth.jwt()->>'email' match).
create policy "inviter can read own referrals" on referrals
  for select using (
    exists (
      select 1 from waitlist w
      where w.id = referrals.referred_by
        and auth.jwt()->>'email' = w.email
    )
  );
