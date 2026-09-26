-- Restore the trigger on auth.users that the 2026-09-25 move to the
-- self-hosted Supabase stack on dev2 left behind.
--
-- The move dumped DDL for the app schemas only, and pg_dump files a trigger
-- under its table's schema, so on_auth_user_created (ON auth.users) was
-- dropped while public.handle_new_user() survived. From the cutover on, a
-- magic-link signup got no profiles row: the dashboard finds no profile for
-- auth.uid() and bounces to /waitlist?error=no-profile, and a referral in
-- the signup metadata was never recorded.
--
-- Replaying every migration, this is the only object the repo creates on an
-- auth.* or storage.* table. There are no storage policies to restore.
--
-- Idempotent: safe to re-run.

-- Final definition: 20260422114210_auth_users_and_profiles.sql. The function
-- it calls was last redefined in 20260422120159_handle_new_user_upsert_and_wipe.sql
-- and still exists.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill what handle_new_user() would have written for the users created
-- while the trigger was missing, with the same upsert on email so a
-- pre-existing waitlist row is linked rather than duplicated.
--
-- The function draws referral_code at random; profiles.referral_code is
-- unique, so the backfill derives it from the user id instead (same 8-hex
-- shape, same result on every run) and skips a user in the unlikely case
-- that code is already taken. The CHECK query reports any user left behind.
insert into public.profiles (email, handle, referred_by, referral_code, user_id)
select
  u.email,
  nullif(trim(u.raw_user_meta_data ->> 'handle'), ''),
  nullif(trim(u.raw_user_meta_data ->> 'referred_by'), ''),
  substr(md5(u.id::text), 1, 8),
  u.id
from auth.users u
where u.email is not null
  and not exists (select 1 from public.profiles p where p.user_id = u.id)
  and not exists (
    select 1 from public.profiles p
     where p.referral_code = substr(md5(u.id::text), 1, 8)
  )
on conflict (email) do update set
  user_id = excluded.user_id,
  handle = coalesce(public.profiles.handle, excluded.handle),
  referred_by = coalesce(public.profiles.referred_by, excluded.referred_by);

-- ... and the referrals row the function adds when the signup metadata named
-- an existing referral code. Run after the insert above so a referrer who
-- also signed up during the gap is found. Scoped to users created since the
-- move; before that the trigger was live and already did this. No email, no
-- webhook: a referral only accrues credit_cents, paid out when the invitee
-- pays.
insert into public.referrals (referred_by, referred_to)
select referrer.id, p.id
from auth.users u
join public.profiles p on p.user_id = u.id
join public.profiles referrer
  on referrer.referral_code = trim(u.raw_user_meta_data ->> 'referred_by')
where u.created_at >= '2026-09-25'
  and nullif(trim(u.raw_user_meta_data ->> 'referred_by'), '') is not null
  and referrer.id <> p.id
on conflict (referred_by, referred_to) do nothing;
