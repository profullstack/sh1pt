import { getSupabaseServerClient } from './supabase/server';
import { getSupabaseFromBearer } from './supabase/bearer';

export interface RequestUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in user for an API request: the CLI's
 * `Authorization: Bearer <access_token>` (from `sh1pt login`), else the
 * browser session cookie. GoTrue verifies the token either way.
 */
export async function requestUser(req: Request): Promise<RequestUser | null> {
  try {
    const bearer = getSupabaseFromBearer(req);
    if (bearer) {
      const { data } = await bearer.supabase.auth.getUser(bearer.token);
      return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
    }
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  } catch {
    return null;
  }
}
