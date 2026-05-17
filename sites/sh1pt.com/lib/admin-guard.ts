import 'server-only';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from './supabase/server';
import { getSupabaseServiceClient } from './supabase/service';

export type AdminUser = {
  id: string;
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
    .select('user_id, email, is_admin')
    .eq('user_id', user.id)
    .maybeSingle<{ user_id: string; email: string | null; is_admin: boolean }>();

  if (!profile?.is_admin) {
    // Render the 403 inline rather than redirecting — gives the user a
    // chance to log in as a different account without a redirect loop.
    throw new Response('Forbidden', { status: 403 });
  }

  return { id: profile.user_id, email: profile.email ?? user.email ?? '', is_admin: true };
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
    .select('user_id, email, is_admin')
    .eq('user_id', user.id)
    .maybeSingle<{ user_id: string; email: string | null; is_admin: boolean }>();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  if (!profile.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { id: profile.user_id, email: profile.email ?? user.email ?? '', is_admin: true };
}
