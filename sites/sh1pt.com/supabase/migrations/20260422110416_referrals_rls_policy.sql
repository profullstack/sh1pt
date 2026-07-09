-- Silence Supabase linter rule rls_enabled_no_policy on public.referrals.
-- All writes happen server-side via the service role (which bypasses RLS),
-- but with RLS enabled and no policies, any non-service-role read is
-- implicitly denied — this matches our current design but the linter
-- flags it as a likely bug. Add an explicit read policy scoped to the
-- inviter's JWT email so once Supabase auth is wired, inviters can
-- query their own referral history from the browser.
--
-- Invitee visibility is intentionally NOT exposed here — inviters own
-- the dashboard view. If we later want invitees to see "who invited
-- me?", add a matching policy then.

create policy "inviter can read own referrals" on referrals
  for select using (auth.jwt()->>'email' = inviter_email);
