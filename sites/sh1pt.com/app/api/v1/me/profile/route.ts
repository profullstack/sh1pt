import { createProfileHandlers } from '@profullstack/profile';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseFromBearer } from '@/lib/supabase/bearer';
import { profileStore } from '@/lib/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET / PUT / PATCH /api/v1/me/profile: the signed-in user's
// @profullstack/profile fields. Browser session cookie or the CLI's
// `Authorization: Bearer <access_token>`.
async function currentUser(req: Request) {
  try {
    const bearer = getSupabaseFromBearer(req);
    const supabase = bearer ? bearer.supabase : await getSupabaseServerClient();
    const { data } = bearer ? await supabase.auth.getUser(bearer.token) : await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  } catch {
    return null;
  }
}

const handlers = () => createProfileHandlers({ store: profileStore(), getUser: currentUser });

export const GET = (req: Request) => handlers().GET(req);
export const PUT = (req: Request) => handlers().PUT(req);
export const PATCH = (req: Request) => handlers().PATCH(req);
