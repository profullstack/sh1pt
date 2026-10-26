'use client';

import { useState } from 'react';

interface InviteView {
  id: string;
  createdAt: number;
  expiresAt: number | null;
  note: string;
  status: 'open' | 'used' | 'expired' | 'revoked';
  usedAt: number | null;
  bonus?: 'granted' | 'denied' | 'pending';
}

interface Overview {
  quota: { total: number; used: number; left: number };
  invites: InviteView[];
  canInvite: boolean;
  unlocksAt: string | null;
  bonusDays: number;
}

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

const STATUS: Record<InviteView['status'], string> = {
  open: 'Open',
  used: 'Used',
  expired: 'Expired',
  revoked: 'Withdrawn',
};

const BONUS: Record<NonNullable<InviteView['bonus']>, string> = {
  granted: 'bonus paid',
  pending: 'bonus waits on email confirmation',
  denied: 'no bonus for this sign-up',
};

export function InvitesManager({ origin, initial }: { origin: string; initial: Overview }) {
  const [data, setData] = useState<Overview>(initial);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ code: string; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    const res = await fetch('/api/v1/invites', { cache: 'no-store' });
    if (res.ok) setData((await res.json()) as Overview);
  }

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/v1/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string; url?: string; error?: string };
      if (!res.ok || !body.code) {
        setErr(body.error ?? 'Could not create an invite.');
      } else {
        setFresh({ code: body.code, url: body.url ?? `${origin}/i/${body.code}` });
        setNote('');
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setErr(null);
    const res = await fetch(`/api/v1/invites/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(body.error ?? 'Could not withdraw the invite.');
    }
    await reload();
  }

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <strong>
          {data.quota.left} of {data.quota.total} invites left
        </strong>
      </div>

      {data.canInvite ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Who is it for? (only you see this)"
            maxLength={200}
            aria-label="Note"
            style={{ flex: '1 1 16rem', padding: '0.7rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)' }}
          />
          <button className="btn" type="button" onClick={create} disabled={busy || data.quota.left < 1}>
            {busy ? 'Creating…' : 'Create invite'}
          </button>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: '0.9rem', marginTop: '0.75rem' }}>
          Invites unlock once your account is a week old
          {data.unlocksAt ? ` (${fmt(Date.parse(data.unlocksAt))})` : ''}.
        </p>
      )}

      {fresh ? (
        <div style={{ marginTop: '0.75rem' }} role="status">
          <div className="muted" style={{ fontSize: '0.85rem' }}>Send this link. It is shown once.</div>
          <code style={{ display: 'block', wordBreak: 'break-all', marginTop: '0.35rem' }}>{fresh.url}</code>
          <button
            className="btn secondary"
            type="button"
            style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}
            onClick={() => navigator.clipboard?.writeText(fresh.url)}
          >
            Copy link
          </button>
        </div>
      ) : null}

      {err ? (
        <p role="alert" style={{ color: 'var(--warn, #ff6a3d)', fontSize: '0.9rem', marginTop: '0.75rem' }}>
          {err}
        </p>
      ) : null}

      {data.invites.length ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'grid', gap: '0.5rem' }}>
          {data.invites.map((i) => (
            <li
              key={i.id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}
            >
              <span>
                <strong>{STATUS[i.status]}</strong>
                {i.note ? ` · ${i.note}` : ''}
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {' '}
                  · created {fmt(i.createdAt)}
                  {i.status === 'open' && i.expiresAt ? ` · expires ${fmt(i.expiresAt)}` : ''}
                  {i.bonus ? ` · ${BONUS[i.bonus]}` : ''}
                </span>
              </span>
              {i.status === 'open' ? (
                <button className="btn secondary" type="button" style={{ fontSize: '0.8rem' }} onClick={() => revoke(i.id)}>
                  Withdraw
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
