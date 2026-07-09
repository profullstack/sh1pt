'use client';

import Link from 'next/link';
import type { GithubAppStatus } from '@/lib/github-app';

const SECTION_STYLE: React.CSSProperties = {
  marginTop: 24,
  padding: 20,
  border: '1px solid var(--border, rgba(255,255,255,0.1))',
  borderRadius: 12,
};

interface Props {
  status: GithubAppStatus;
}

export default function GithubAppSection({ status }: Props) {
  return (
    <section style={SECTION_STYLE}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>GitHub App — Actions Fleet</h2>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
            One-time platform setup. Register sh1pt as a GitHub App via the App Manifest flow —
            GitHub returns the App ID, private key, and client/webhook secrets in one shot, ready
            to paste into Railway. After that, every user can install the App from{' '}
            <Link href="/dashboard/connect/github">
              <code>/dashboard/connect/github</code>
            </Link>
            .
          </p>
        </div>
        <Link
          href="/admin/github/setup"
          className="btn"
          style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          {status.configured ? 'Re-register App' : 'Register App'}
        </Link>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 8,
          background: status.configured ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${status.configured ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
          fontSize: '0.85rem',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '4px 16px',
        }}
      >
        <span style={{ color: status.configured ? '#4ade80' : 'rgba(255,255,255,0.6)' }}>
          {status.configured ? '● Configured' : '○ Not configured'}
        </span>
        <span className="muted">
          {status.configured
            ? `App ${status.app_id}${status.app_slug ? ` (${status.app_slug})` : ''}`
            : 'Click Register App to create one'}
        </span>
        <span className="muted">App ID</span>
        <code>{status.app_id || '—'}</code>
        <span className="muted">App slug</span>
        <code>{status.app_slug || '—'}</code>
        <span className="muted">Private key</span>
        <span>{status.private_key_set ? '✓ Set in Railway' : '✗ Missing'}</span>
        <span className="muted">Client secret</span>
        <span>{status.client_secret_set ? '✓ Set in Railway' : '✗ Missing'}</span>
        <span className="muted">Webhook secret</span>
        <span>{status.webhook_secret_set ? '✓ Set in Railway' : '— (optional)'}</span>
      </div>

      <p className="muted" style={{ fontSize: '0.75rem', marginTop: 12 }}>
        Credentials live in Railway env vars, not the database. Re-register only if you&apos;ve lost
        access to the existing App on github.com.
      </p>
    </section>
  );
}
