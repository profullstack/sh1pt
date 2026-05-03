import type { ReactNode } from 'react';
import './globals.css';
import NavLink from './components/NavLink';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'sh1pt — Build. Promote. Scale. Iterate…',
  description:
    'One codebase → every store, registry, CDN, and channel. Ads on every network. Cloud infra on demand. AI agents tighten the loop.',
  metadataBase: new URL('https://sh1pt.com'),
  openGraph: {
    title: 'sh1pt — Build. Promote. Scale. Iterate…',
    description: 'One codebase. Every store. Ads everywhere. Cloud on demand. AI agents iterate.',
    url: 'https://sh1pt.com',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'sh1pt', description: 'Build. Promote. Scale. Iterate…' },
  icons: { icon: '/favicon.svg' },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Header adapts to auth state: signed-in users see Dashboard + Sign out,
  // signed-out users see Sign in + the primary Join-waitlist CTA.
  //
  // getUser() can throw on stale cookies (e.g. after a db wipe) with
  // refresh_token_not_found. Treat any failure as "logged out" so a
  // bad cookie can't 500 the entire site — the cookie will get cleared
  // on the user's next auth action (sign in / sign out / magic link).
  const user = await safeGetUser();

  return (
    <html lang="en">
      <body>
        <div className="brand-stripe" aria-hidden />
        <header className="site-header">
          <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem' }}>
            <a href="/" className="brand-logo" aria-label="sh1pt">
              sh1pt<span className="brand-dot" aria-hidden>.</span>
            </a>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <NavLink href="/getting-started" matchPrefix>Getting started</NavLink>
              <NavLink href="/#pricing">Pricing</NavLink>
              <NavLink href="/investors" matchPrefix>Investors</NavLink>
              <NavLink href="/deck" matchPrefix>Deck</NavLink>
              <NavLink href="https://github.com/profullstack/sh1pt" target="_blank" rel="noreferrer">GitHub</NavLink>
              {user ? (
                <>
                  <NavLink href="/dashboard" matchPrefix>Dashboard</NavLink>
                  <form action="/auth/signout" method="post" style={{ display: 'inline' }}>
                    <button
                      type="submit"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        font: 'inherit',
                        padding: 0,
                      }}
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <NavLink href="/login">Sign in</NavLink>
                  <a className="btn" href="/waitlist">Join waitlist</a>
                </>
              )}
            </div>
          </nav>
        </header>
        {children}
        <footer className="container" style={{ padding: '3rem 1.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          <div>© 2026 Profullstack, Inc. — sh1pt is MIT-licensed.</div>
          <div style={{ marginTop: '0.5rem' }}>
            <a href="/investors">Investors</a> · <a href="/waitlist">Waitlist</a> · <a href="https://github.com/profullstack/sh1pt">Source</a>
          </div>
        </footer>
      </body>
    </html>
  );
}

async function safeGetUser() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}
