-- Bootstrap admin so the /admin route is usable as soon as deploy
-- lands. profiles.is_admin shipped in 20260515060000_blog_and_admin
-- but was never flipped on for the founder, which made the admin
-- guard fall through to its (broken) "Forbidden" branch and crash
-- the page client-side.
--
-- profiles.user_id is the FK to auth.users(id) here (id is the
-- profile row's own pk), so the join goes through user_id.

update public.profiles p
  set is_admin = true
  from auth.users u
 where p.user_id = u.id
   and lower(u.email) = lower('anthony@profullstack.com');
