'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import GithubAppSection from './GithubAppSection';
import type { GithubAppStatus } from '@/lib/github-app';

type Integration = {
  id: string;
  name: string;
  kind: 'crawlproof';
  access_token: string;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
};

type TelnyxVoiceConfig = {
  webhookUrl: string;
  status: {
    apiKeySet: boolean;
    publicKeySet: boolean;
    signatureVerificationDisabled: boolean;
    assistantWebhookSet: boolean;
    assistantWebhookSigningSet: boolean;
    voice: string;
    language: string;
  };
};

export default function AdminContent({ ghStatus }: { ghStatus: GithubAppStatus }) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [telnyxVoice, setTelnyxVoice] = useState<TelnyxVoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('Crawlproof');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve the absolute URL after mount so the initial SSR HTML stays
  // identical to the first client render — otherwise React 19's strict
  // hydration check throws and the page crashes client-side.
  const [webhookUrl, setWebhookUrl] = useState('/api/webhooks/crawlproof');
  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhooks/crawlproof`);
  }, []);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/integrations', { credentials: 'include' });
      if (!res.ok) {
        setError(res.status === 403 ? 'Forbidden' : 'Failed to load integrations');
        return;
      }
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  const fetchTelnyxVoice = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/telnyx/voice', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as TelnyxVoiceConfig;
      setTelnyxVoice(data);
    } catch {
      // The admin page still has other useful integration controls.
    }
  }, []);

  useEffect(() => {
    void fetchTelnyxVoice();
  }, [fetchTelnyxVoice]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        setError('Failed to create integration');
        return;
      }
      const data = await res.json();
      setIntegrations((prev) => [data.integration, ...prev]);
      setRevealed((prev) => ({ ...prev, [data.integration.id]: true }));
      setNewName('Crawlproof');
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Revoke this integration? Crawlproof will stop being able to publish.')) return;
    try {
      const res = await fetch(`/api/admin/integrations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setError('Failed to delete');
        return;
      }
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError('Network error');
    }
  };

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, maxWidth: 760 }}>
      <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: 0 }}>Admin</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        Platform integrations: Crawlproof Autoblog webhook, Telnyx Voice AI, and Actions Fleet GitHub App.
      </p>

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: '1px solid rgba(248,113,113,0.4)',
            background: 'rgba(248,113,113,0.08)',
            borderRadius: 8,
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          marginTop: 32,
          padding: 20,
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Webhook endpoint</h2>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          Paste this into Crawlproof's Autoblog setup page. See{' '}
          <a
            href="https://crawlproof.com/docs/autoblog-webhook"
            target="_blank"
            rel="noreferrer"
          >
            docs
          </a>
          .
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <code
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: 6,
              fontSize: '0.85rem',
              wordBreak: 'break-all',
            }}
          >
            {webhookUrl}
          </code>
          <button className="btn secondary" onClick={() => copy('url', webhookUrl)}>
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Telnyx Voice AI webhook</h2>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          Set this as the primary URL on the Telnyx Voice API connection for the phone-number assistant.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <code
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: 6,
              fontSize: '0.85rem',
              wordBreak: 'break-all',
            }}
          >
            {telnyxVoice?.webhookUrl ?? 'https://sh1pt.com/api/webhooks/telnyx/voice'}
          </code>
          <button
            className="btn secondary"
            onClick={() =>
              copy('telnyx-url', telnyxVoice?.webhookUrl ?? 'https://sh1pt.com/api/webhooks/telnyx/voice')
            }
          >
            {copied === 'telnyx-url' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 8,
            marginTop: 16,
            fontSize: '0.8rem',
          }}
        >
          <StatusPill label="TELNYX_API_KEY" ok={telnyxVoice?.status.apiKeySet ?? false} />
          <StatusPill label="TELNYX_PUBLIC_KEY" ok={telnyxVoice?.status.publicKeySet ?? false} />
          <StatusPill label="Assistant URL" ok={telnyxVoice?.status.assistantWebhookSet ?? false} />
          <StatusPill label="Assistant signing" ok={telnyxVoice?.status.assistantWebhookSigningSet ?? false} />
        </div>
        {telnyxVoice?.status.signatureVerificationDisabled && (
          <p style={{ color: '#fbbf24', marginTop: 12, fontSize: '0.8rem' }}>
            Signature verification is disabled by TELNYX_VERIFY_SIGNATURE=false.
          </p>
        )}
      </section>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Access tokens</h2>
          <button
            className="btn secondary"
            style={{ fontSize: '0.85rem' }}
            onClick={fetchIntegrations}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Integration name"
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
              borderRadius: 6,
              color: 'inherit',
              fontSize: '0.9rem',
            }}
          />
          <button
            className="btn"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
          >
            {creating ? 'Creating…' : 'Generate token'}
          </button>
        </div>

        {integrations.length === 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>
            No integrations yet — generate a token above.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 16, display: 'grid', gap: 12 }}>
            {integrations.map((it) => {
              const isRevealed = !!revealed[it.id];
              const masked = `${it.access_token.slice(0, 8)}…${it.access_token.slice(-4)}`;
              return (
                <li
                  key={it.id}
                  style={{
                    padding: 16,
                    border: '1px solid var(--border, rgba(255,255,255,0.08))',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.2)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                        <strong>{it.name}</strong>
                        <span className="muted" style={{ fontSize: '0.8rem' }}>
                          {it.request_count} requests
                          {it.last_used_at && ` · last ${new Date(it.last_used_at).toLocaleString()}`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                        <code
                          style={{
                            flex: 1,
                            padding: '4px 8px',
                            background: 'rgba(0,0,0,0.4)',
                            borderRadius: 4,
                            fontSize: '0.75rem',
                            wordBreak: 'break-all',
                          }}
                        >
                          {isRevealed ? it.access_token : masked}
                        </code>
                        <button
                          className="muted"
                          style={{ background: 'none', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}
                          onClick={() => setRevealed((prev) => ({ ...prev, [it.id]: !prev[it.id] }))}
                        >
                          {isRevealed ? 'Hide' : 'Reveal'}
                        </button>
                        <button
                          className="muted"
                          style={{ background: 'none', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}
                          onClick={() => copy(it.id, it.access_token)}
                        >
                          {copied === it.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="muted" style={{ marginTop: 8, fontSize: '0.75rem' }}>
                        Use as <code>Authorization: Bearer &lt;token&gt;</code> on Crawlproof. Created{' '}
                        {new Date(it.created_at).toLocaleDateString()}.
                      </p>
                    </div>
                    <button
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f87171',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleDelete(it.id)}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <GithubAppSection status={ghStatus} />

      <p style={{ marginTop: 24, fontSize: '0.85rem' }}>
        <Link href="/dashboard" className="muted">
          ← Back to dashboard
        </Link>
      </p>
    </main>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 8px',
        border: '1px solid var(--border, rgba(255,255,255,0.08))',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <span className="muted">{label}</span>
      <strong style={{ color: ok ? '#22c55e' : '#f87171' }}>{ok ? 'Set' : 'Missing'}</strong>
    </span>
  );
}
