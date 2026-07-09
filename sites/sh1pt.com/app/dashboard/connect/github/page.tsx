import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { env, isGithubAppConfigured } from '@/lib/env';

export const metadata = {
  title: 'Connect GitHub — sh1pt',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ConnectGithubPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/connect/github');

  const configured = isGithubAppConfigured();
  const slug = env.githubAppSlug;
  const installUrl = configured && slug
    ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`
    : null;

  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, maxWidth: 720 }}>
      <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', margin: 0 }}>Connect GitHub</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        Install the sh1pt Actions Fleet app on your GitHub account or org. Pick which repos to
        manage on the next screen.
      </p>

      {!installUrl ? (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            border: '1px solid rgba(248,113,113,0.4)',
            background: 'rgba(248,113,113,0.08)',
            borderRadius: 8,
            fontSize: '0.9rem',
          }}
        >
          The sh1pt GitHub App is not configured yet. Ask an admin to register it at{' '}
          <Link href="/admin">/admin</Link>.
        </div>
      ) : (
        <section
          style={{
            marginTop: 32,
            padding: 24,
            border: '1px solid var(--border, rgba(255,255,255,0.1))',
            borderRadius: 12,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Install the app</h2>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            GitHub will ask which org and which repositories to grant access to. You can change
            this later in <code>github.com/settings/installations</code>.
          </p>
          <a className="btn" href={installUrl} style={{ display: 'inline-block', marginTop: 12 }}>
            Install sh1pt on GitHub →
          </a>
        </section>
      )}

      <p style={{ marginTop: 24, fontSize: '0.85rem' }}>
        <Link href="/dashboard" className="muted">
          ← Back to dashboard
        </Link>
      </p>
    </main>
  );
}
