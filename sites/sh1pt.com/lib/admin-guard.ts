import 'server-only';
import { NextResponse } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServerClient } from './supabase/server';
import { getSupabaseServiceClient } from './supabase/service';

export type AdminUser = {
  /** auth.users.id — what app code thinks of as "the user id". */
  id: string;
  /** profiles.id — the profile row's PK. Use this for FKs that
   *  reference public.profiles(id) (e.g. blog_integrations.created_by). */
  profileId: string;
  email: string;
  is_admin: true;
};

// Server-component / Server-action gate. Redirects unauthenticated
// callers to /login and 403s non-admins. Returns the AdminUser on
// success so the caller can use the email/id.
export async function requireAdminPage(): Promise<AdminUser> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');

  const admin = getSupabaseServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, user_id, email, is_admin')
    .eq('user_id', user.id)
    .maybeSingle<{
      id: string;
      user_id: string;
      email: string | null;
      is_admin: boolean;
    }>();

  if (!profile?.is_admin) {
    // 404 (not redirect, not throw) so a non-admin can't fingerprint
    // the route's existence. Throwing a Response here crashes
    // client-side in React 19 — it isn't a recognized control-flow
    // signal in server components.
    notFound();
  }

  return {
    id: profile.user_id,
    profileId: profile.id,
    email: profile.email ?? user.email ?? '',
    is_admin: true,
  };
}

// Route-handler gate. Same checks, but returns a JSON NextResponse on
// failure so API routes can short-circuit cleanly.
export async function requireAdminApi(): Promise<AdminUser | NextResponse> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = getSupabaseServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, user_id, email, is_admin')
    .eq('user_id', user.id)
    .maybeSingle<{
      id: string;
      user_id: string;
      email: string | null;
      is_admin: boolean;
    }>();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  if (!profile.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return {
    id: profile.user_id,
    profileId: profile.id,
    email: profile.email ?? user.email ?? '',
    is_admin: true,
  };
}
