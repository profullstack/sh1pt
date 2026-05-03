import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Build a Supabase client scoped to the bearer token on an incoming
// API request. Used by the /api/v1/vault/* routes — RLS applies, so
// the user can only see/write their own rows. The CLI sets
// `Authorization: Bearer <access_token>` after `sh1pt login`.
export function getSupabaseFromBearer(req: Request): {
  supabase: SupabaseClient;
  token: string;
} | null {
  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { supabase, token };
}
