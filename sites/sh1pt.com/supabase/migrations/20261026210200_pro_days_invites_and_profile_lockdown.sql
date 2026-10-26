-- Credit codes and invites grant days of sh1pt Pro, and the paid/admin
-- columns on profiles become server-only.
--
-- dev2 self-hosted Supabase has no automatic migration step. Apply by hand
-- after 20261026210000_redeem_credits.sql and 20261026210100_affiliates.sql:
--   docker exec -i sh1pt-com-supabase-db psql -U postgres -d postgres -1 < this file
--   then: notify pgrst, 'reload schema';
--
-- 1. profiles.pro_until: the paid plan's expiry. sh1pt's only paid state so
--    far is profiles.prepaid (the $244/yr founder prepay, no expiry column).
--    A Pro account is `prepaid OR pro_until > now()` (lib/plan.ts). Checkout
--    will extend pro_until the same way when it opens.
-- 2. grant_pro_days(user, days, source): the one way to add Pro time. Keyed
--    on (user, source) in pro_day_grants, so a retried or replayed grant
--    never adds time twice. Running time is extended, never reset. Service
--    role only.
-- 3. invite_bonuses: one row per (invite, side) once the invite bonus is
--    decided (granted, or denied with a reason), claimed before the grant.
--    One invitee row per account.
-- 4. Security: "users can update own profile" let any signed-in user PATCH
--    their own profiles row through PostgREST with the public anon key,
--    including is_admin (admin takeover), prepaid, price_cents and the
--    referral columns. A trigger now pins every column but `handle` for the
--    anon and authenticated roles. bump_blog_integration (SECURITY DEFINER)
--    was executable by anon; only the service role calls it.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.pro_day_grants (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  days INTEGER NOT NULL CHECK (days > 0),
  pro_until_after TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source)
);
ALTER TABLE public.pro_day_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_day_grants FROM anon, authenticated;

-- p_user_id is the auth user id (profiles.user_id).
CREATE OR REPLACE FUNCTION public.grant_pro_days(
  p_user_id UUID,
  p_days INTEGER,
  p_source TEXT
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_until TIMESTAMPTZ;
  new_until TIMESTAMPTZ;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 3660 THEN
    RAISE EXCEPTION 'grant_pro_days: days must be 1..3660, got %', p_days;
  END IF;
  IF p_source IS NULL OR length(trim(p_source)) = 0 THEN
    RAISE EXCEPTION 'grant_pro_days: source required';
  END IF;

  SELECT pro_until INTO current_until
    FROM public.profiles
   WHERE user_id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_pro_days: no profile for user %', p_user_id;
  END IF;

  -- Already applied: report the expiry, change nothing.
  IF EXISTS (SELECT 1 FROM public.pro_day_grants WHERE user_id = p_user_id AND source = p_source) THEN
    RETURN current_until;
  END IF;

  new_until := GREATEST(NOW(), COALESCE(current_until, NOW())) + make_interval(days => p_days);

  INSERT INTO public.pro_day_grants (user_id, source, days, pro_until_after)
  VALUES (p_user_id, p_source, p_days, new_until);

  UPDATE public.profiles SET pro_until = new_until WHERE user_id = p_user_id;
  RETURN new_until;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_pro_days(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_pro_days(UUID, INTEGER, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.invite_bonuses (
  invite_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('inviter', 'invitee')),
  user_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('granted', 'denied')),
  reason TEXT,
  days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (invite_id, side)
);
CREATE INDEX IF NOT EXISTS invite_bonuses_user_idx ON public.invite_bonuses (user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS invite_bonuses_one_per_invitee
  ON public.invite_bonuses (user_id) WHERE side = 'invitee';
ALTER TABLE public.invite_bonuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invite_bonuses FROM anon, authenticated;

-- Signed-in users may still edit their handle; nothing else.
CREATE OR REPLACE FUNCTION public.profiles_protect_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  keep_handle TEXT;
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'profiles: rows are created by the server';
    END IF;
    keep_handle := NEW.handle;
    NEW := OLD;
    NEW.handle := keep_handle;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_columns ON public.profiles;
CREATE TRIGGER profiles_protect_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_columns();

REVOKE ALL ON FUNCTION public.bump_blog_integration(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_blog_integration(UUID) TO service_role;
