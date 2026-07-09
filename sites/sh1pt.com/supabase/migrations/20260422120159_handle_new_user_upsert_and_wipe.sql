-- Fix and wipe:
--   1. Make handle_new_user() tolerant of pre-existing profile rows
--      with the same email (they pre-date Supabase auth). Was throwing
--      a unique-constraint violation → the trigger silently dropped
--      the auth.users insert → dashboard saw no matching profile and
--      bounced to /waitlist?error=no-profile.
--   2. Wipe auth.users + profiles + referrals so we start clean, as
--      explicitly requested. auth.users cascades to identities,
--      sessions, refresh tokens.

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
  -- Upsert on email so pre-existing waitlist rows get linked to the
  -- new auth.users row instead of colliding. Existing handle/referred_by
  -- values win (don't clobber what the user previously entered).
  insert into public.profiles (email, handle, referred_by, referral_code, user_id)
  values (
    new.email,
    nullif(trim(handle_val), ''),
    nullif(trim(referrer_code), ''),
    lpad(to_hex((random() * 2147483647)::bigint), 8, '0'),
    new.id
  )
  on conflict (email) do update set
    user_id = excluded.user_id,
    handle = coalesce(public.profiles.handle, excluded.handle),
    referred_by = coalesce(public.profiles.referred_by, excluded.referred_by)
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

-- Nuke existing data. Run last so a trigger-related failure above
-- aborts the whole migration before we wipe anything.
truncate table public.referrals cascade;
truncate table public.profiles cascade;
truncate table auth.users cascade;
