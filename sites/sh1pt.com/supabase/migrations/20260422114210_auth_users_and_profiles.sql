-- Pivot waitlist from a pure DB insert to Supabase Auth + magic-link flow.
--
-- Before: a plain `waitlist` row anyone could create, referral link shown
-- immediately on submit.
--
-- After: signup calls auth.signInWithOtp(email). Supabase sends a magic
-- link (via the SMTP already configured in the project). Clicking it
-- lands the user on /auth/callback → /dashboard, which reads their
-- profile + referral metrics from this same table, now renamed `profiles`
-- and linked to auth.users.
--
-- Existing data: waitlist is empty (verified), so no backfill. The
-- referrals table already keys by profiles.id (was waitlist.id) so the
-- uuid references stay stable through the rename.

-- 1. Rename + link to auth.users
alter table waitlist rename to profiles;
alter table profiles
  add column user_id uuid unique references auth.users(id) on delete cascade;

-- 2. Replace the old anon-email RLS policy (auth.users wasn't involved
-- before) with proper user-scoped ones.
drop policy if exists "anon can read own waitlist row" on profiles;

create policy "users can read own profile" on profiles
  for select using (user_id = auth.uid());

create policy "users can update own profile" on profiles
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. Re-scope the referrals read policy to use user_id through profiles
-- (old policy joined via email, now we join via auth.uid()).
drop policy if exists "inviter can read own referrals" on referrals;

create policy "inviter can read own referrals" on referrals
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = referrals.referred_by
        and p.user_id = auth.uid()
    )
  );

-- 4. Trigger: when a new auth.users row is created (i.e. the first time
-- someone clicks their magic link), auto-create a profiles row with:
--   - a generated 8-hex-char referral_code
--   - handle + referred_by copied from signup metadata (supplied by the
--     waitlist form via signInWithOtp options.data)
--   - a referrals row if referred_by matches an existing profile
--
-- Runs as security definer so it can insert into public.profiles even
-- though the raw auth.users INSERT originated from the auth schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_profile_id uuid;
  referrer_code text := new.raw_user_meta_data ->> 'referred_by';
  handle_val text := new.raw_user_meta_data ->> 'handle';
  referrer_profile_id uuid;
begin
  insert into public.profiles (email, handle, referred_by, referral_code, user_id)
  values (
    new.email,
    nullif(trim(handle_val), ''),
    nullif(trim(referrer_code), ''),
    lpad(to_hex((random() * 2147483647)::bigint), 8, '0'),
    new.id
  )
  returning id into new_profile_id;

  if referrer_code is not null and trim(referrer_code) <> '' then
    select id into referrer_profile_id
    from public.profiles
    where referral_code = trim(referrer_code)
    limit 1;

    if referrer_profile_id is not null and referrer_profile_id <> new_profile_id then
      insert into public.referrals (referred_by, referred_to)
      values (referrer_profile_id, new_profile_id)
      on conflict (referred_by, referred_to) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
