import type { Metadata } from 'next';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import LoginCodeForm from './LoginCodeForm';

export const metadata: Metadata = {
  title: 'Pair the sh1pt CLI',
  description: 'Approve a pairing code from your sh1pt CLI to grant it access to your account.',
};

export default async function CliLoginPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const { code } = await searchParams;

  if (!data?.user) {
    return (
      <main>
        <section>
          <div className="container">
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              sh1pt CLI
            </div>
            <h1>Sign in first</h1>
            <p className="muted" style={{ maxWidth: 720 }}>
              You need to be signed in to approve a CLI pairing. Sign in below, then come back to this page — keep the URL handy{code ? `: it has your code (${code}) baked in` : ''}.
            </p>
            <a className="btn" href="/login" style={{ marginTop: '1rem' }}>Sign in</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section>
        <div className="container">
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            sh1pt CLI
          </div>
          <h1>Pair your CLI</h1>
          <p className="muted" style={{ maxWidth: 720 }}>
            Your terminal showed a code like <code>ABCD-2F7H</code>. Type it below to grant the CLI on this machine access to your sh1pt.com account. Codes expire after 10 minutes; if yours has, run <code>sh1pt login</code> again to mint a fresh one.
          </p>
          <p className="muted" style={{ maxWidth: 720, fontSize: '0.9rem' }}>
            Signed in as <strong style={{ color: 'var(--fg)' }}>{data!.user!.email}</strong>.
          </p>
          <LoginCodeForm initialCode={code ?? ''} />
        </div>
      </section>
    </main>
  );
}
