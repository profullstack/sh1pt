'use client';

import { useEffect, useState } from 'react';

interface Secrets {
  app_id?: string;
  slug?: string;
  client_id?: string;
  client_secret?: string;
  webhook_secret?: string;
  pem?: string;
  html_url?: string;
  owner?: string;
}

export default function SetupDoneClient() {
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const frag = window.location.hash.replace(/^#/, '');
    if (!frag) return;
    const params = new URLSearchParams(frag);
    const obj: Secrets = {};
    for (const [k, v] of params.entries()) {
      (obj as Record<string, string>)[k] = v;
    }
    setSecrets(obj);
    // Don't strip the hash — admin might refresh while copying. Nothing
    // is persisted server-side, so the page is safe to leave open.
  }, []);

  if (!secrets) {
    return (
      <p className="muted" style={{ marginTop: 24, fontSize: '0.9rem' }}>
        Waiting for values from the URL fragment… if you see this for more than a second, the
        manifest flow didn&apos;t complete — go back to{' '}
        <a href="/admin/github/setup">/admin/github/setup</a>.
      </p>
    );
  }

  const envBlock = [
    `GITHUB_APP_ID=${secrets.app_id ?? ''}`,
    `GITHUB_APP_SLUG=${secrets.slug ?? ''}`,
    `GITHUB_APP_CLIENT_ID=${secrets.client_id ?? ''}`,
    `GITHUB_APP_CLIENT_SECRET=${secrets.client_secret ?? ''}`,
    secrets.webhook_secret
      ? `GITHUB_APP_WEBHOOK_SECRET=${secrets.webhook_secret}`
      : '# GITHUB_APP_WEBHOOK_SECRET= (none set; safe to leave unset for now)',
    `GITHUB_APP_PRIVATE_KEY=${JSON.stringify(secrets.pem ?? '')}`,
  ].join('\n');

  const ownerLogin = secrets.owner ?? '';
  const slug = secrets.slug ?? '';
  const manageUrl =
    ownerLogin && slug
      ? `https://github.com/settings/apps/${slug}`
      : null;
  const installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(envBlock).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  };

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
      <section
        style={{
          padding: 16,
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Paste into Railway → Variables</h2>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          The private key is shell-escaped so newlines survive a paste — Railway accepts the quoted
          form verbatim.
        </p>
        <pre
          style={{
            marginTop: 12,
            padding: 12,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--border, rgba(255,255,255,0.1))',
            borderRadius: 6,
            fontSize: '0.75rem',
            overflowX: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            lineHeight: 1.5,
          }}
        >
          {envBlock}
        </pre>
        <button
          type="button"
          className="btn secondary"
          onClick={handleCopy}
          style={{ marginTop: 12, fontSize: '0.85rem' }}
        >
          {copied ? '✓ Copied' : 'Copy env block'}
        </button>
      </section>

      <section
        style={{
          padding: 16,
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Useful links</h2>
        <ul style={{ marginTop: 8, fontSize: '0.9rem', lineHeight: 1.7 }}>
          {manageUrl ? (
            <li>
              Manage the App on GitHub:{' '}
              <a href={manageUrl} target="_blank" rel="noreferrer">
                {manageUrl}
              </a>
            </li>
          ) : null}
          {installUrl ? (
            <li>
              Install it on a user/org:{' '}
              <a href={installUrl} target="_blank" rel="noreferrer">
                {installUrl}
              </a>
            </li>
          ) : null}
          <li>
            App owner: <code>{ownerLogin || '—'}</code>
          </li>
        </ul>
      </section>

      <p className="muted" style={{ fontSize: '0.75rem' }}>
        Refresh-safe — nothing is persisted server-side; secrets only exist in this page&apos;s URL
        fragment. After pasting into Railway and redeploying, navigate away and re-open the manage
        link above if you need the values again.
      </p>
    </div>
  );
}
