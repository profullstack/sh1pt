import { getSupabaseServerClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main style={{ fontFamily: 'system-ui', padding: 32 }}>
      <h1>sh1pt · next + supabase</h1>
      {user ? (
        <p>Signed in as {user.email}</p>
      ) : (
        <p>Not signed in. Add your Supabase keys to <code>.env.local</code>.</p>
      )}
    </main>
  );
}
