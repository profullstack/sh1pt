import { createClient } from '@supabase/supabase-js';

// Service-role client. Bypasses RLS, ONLY use server-side from server
// actions / API routes. Never import this into client components.
// SUPABASE_SERVICE_ROLE_KEY must only ever live in a server env —
// never prefix it with NEXT_PUBLIC_.
export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set (server env)');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
