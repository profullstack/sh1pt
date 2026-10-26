'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const inputStyle = {
  flex: '1 1 16rem',
  padding: '0.7rem',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--fg)',
  fontFamily: 'var(--mono, monospace)',
} as const;

// "Have a code?" — redeems a credit code for days of sh1pt Pro.
export function RedeemCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/v1/credits/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; days?: number; error?: string };
      if (res.ok && body.ok) {
        setMsg({ ok: true, text: `Redeemed: ${body.days} days of sh1pt Pro added.` });
        setCode('');
        router.refresh();
      } else {
        setMsg({ ok: false, text: body.error ?? 'That code did not work.' });
      }
    } catch {
      setMsg({ ok: false, text: 'Could not reach sh1pt. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: '1rem' }}>
      <label htmlFor="credit-code" className="muted" style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
        Have a code?
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          id="credit-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CR-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
        <button className="btn secondary" type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Redeeming…' : 'Redeem'}
        </button>
      </div>
      {msg ? (
        <p role="status" style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: msg.ok ? 'var(--accent)' : 'var(--warn, #ff6a3d)' }}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
