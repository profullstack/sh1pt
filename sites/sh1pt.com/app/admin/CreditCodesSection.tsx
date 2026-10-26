'use client';

import { useCallback, useEffect, useState } from 'react';

interface CodeInfo {
  id: string;
  label: string;
  grant: { unit: string; amount: number };
  maxRedemptions: number;
  redemptions: number;
  expiresAt: number | null;
  createdAt: number;
  revokedAt: number | null;
}

const field = {
  padding: '0.55rem',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--fg)',
} as const;

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Mint, list and revoke credit codes (days of sh1pt Pro).
export default function CreditCodesSection() {
  const [codes, setCodes] = useState<CodeInfo[]>([]);
  const [days, setDays] = useState('30');
  const [label, setLabel] = useState('');
  const [max, setMax] = useState('1');
  const [expires, setExpires] = useState('');
  const [minted, setMinted] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/credit-codes', { cache: 'no-store' });
    if (res.ok) setCodes(((await res.json()) as { codes: CodeInfo[] }).codes);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function mint(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMinted(null);
    try {
      const res = await fetch('/api/admin/credit-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days, label, maxRedemptions: max, expiresInDays: expires }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok || !body.code) setErr(body.error ?? 'Mint failed');
      else {
        setMinted(body.code);
        setLabel('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this code? Redemptions already made keep their days.')) return;
    await fetch(`/api/admin/credit-codes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  }

  return (
    <section style={{ marginTop: 32, padding: 20, border: '1px solid var(--border, rgba(255,255,255,0.1))', borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>Credit codes</h2>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        A code adds days of sh1pt Pro (profiles.pro_until) to whoever redeems it on their dashboard or with{' '}
        <code>sh1pt redeem</code>. The code is shown once; only its hash is stored.
      </p>
      <form onSubmit={mint} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ fontSize: '0.8rem' }}>
          Days
          <br />
          <input style={{ ...field, width: 80 }} type="number" min={1} max={3660} value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label style={{ fontSize: '0.8rem', flex: '1 1 12rem' }}>
          Label (who it is for)
          <br />
          <input style={{ ...field, width: '100%' }} value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Uses
          <br />
          <input style={{ ...field, width: 70 }} type="number" min={1} max={10000} value={max} onChange={(e) => setMax(e.target.value)} />
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Expires in days
          <br />
          <input style={{ ...field, width: 90 }} type="number" min={1} max={3660} placeholder="never" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Minting…' : 'Mint code'}
        </button>
      </form>
      {minted ? (
        <p style={{ marginTop: 12 }}>
          New code (copy it now): <code style={{ fontSize: '1.05rem' }}>{minted}</code>
        </p>
      ) : null}
      {err ? <p style={{ color: '#f87171', marginTop: 12 }}>{err}</p> : null}
      {codes.length ? (
        <table style={{ width: '100%', marginTop: 16, fontSize: '0.85rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="muted" style={{ textAlign: 'left' }}>
              <th>Label</th>
              <th>Days</th>
              <th>Used</th>
              <th>Created</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
                <td>{c.label}</td>
                <td>{c.grant.amount}</td>
                <td>
                  {c.redemptions}/{c.maxRedemptions}
                </td>
                <td>{fmt(c.createdAt)}</td>
                <td>
                  {c.revokedAt
                    ? 'revoked'
                    : c.expiresAt && Date.now() >= c.expiresAt
                      ? 'expired'
                      : c.redemptions >= c.maxRedemptions
                        ? 'used up'
                        : 'active'}
                </td>
                <td>
                  {!c.revokedAt ? (
                    <button className="btn secondary" type="button" style={{ fontSize: '0.75rem' }} onClick={() => revoke(c.id)}>
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
