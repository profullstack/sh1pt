import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'sh1pt — Build. Promote. Scale. Iterate…',
  description:
    'One codebase → every store, registry, CDN, and channel. Ads on every network. Cloud infra on demand. AI agents tighten the loop.',
  metadataBase: new URL('https://sh1pt.dev'),
  openGraph: {
    title: 'sh1pt — Build. Promote. Scale. Iterate…',
    description: 'One codebase. Every store. Ads everywhere. Cloud on demand. AI agents iterate.',
    url: 'https://sh1pt.dev',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'sh1pt', description: 'Build. Promote. Scale. Iterate…' },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem 1.5rem' }}>
            <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', color: 'inherit', textDecoration: 'none' }}>
              <img src="/logo.svg" alt="sh1pt" height={32} />
            </a>
            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
              <a href="#pricing">Pricing</a>
              <a href="/investors">Investors</a>
              <a href="https://github.com/profullstack/sh1pt" target="_blank" rel="noreferrer">GitHub</a>
              <a className="btn" href="/waitlist">Join waitlist</a>
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
