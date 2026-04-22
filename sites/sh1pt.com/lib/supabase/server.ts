import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Anon-key server client that reads/writes the session cookie. Safe to
// use from Server Components (reads work fine), Server Actions and
// Route Handlers (reads + writes). We swallow the set error on Server
// Components since Next 15 forbids mutation during render — Supabase's
// token refresh will retry on the next request where it's legal.
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookie mutation not
            // allowed. Middleware or the next Server Action/Route
            // Handler will refresh the session.
          }
        },
      },
    },
  );
}
