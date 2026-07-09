'use client';

import { useState, type FormEvent } from 'react';

export default function LoginCodeForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/v1/cli/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('err');
        setMessage(body.error ? humanize(body.error) : `failed (${res.status})`);
        return;
      }
      setStatus('ok');
      setMessage('Paired. You can return to your terminal — the CLI will pick up the session within a few seconds.');
    } catch (err) {
      setStatus('err');
      setMessage(err instanceof Error ? err.message : 'network error');
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: '1.5rem', maxWidth: 480 }}>
      <label
        htmlFor="code"
        style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.4rem' }}
      >
        Pairing code
      </label>
      <input
        id="code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD-2F7H"
        disabled={status === 'submitting' || status === 'ok'}
        style={{
          width: '100%',
          padding: '0.85rem 1rem',
          fontSize: '1.25rem',
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          letterSpacing: '0.1em',
          background: 'var(--card)',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          outline: 'none',
        }}
      />
      <div style={{ marginTop: '1rem' }}>
        <button className="btn" type="submit" disabled={status === 'submitting' || status === 'ok' || code.trim().length < 4}>
          {status === 'submitting' ? 'Approving…' : status === 'ok' ? 'Paired' : 'Approve'}
        </button>
      </div>
      {message ? (
        <p
          style={{
            marginTop: '1rem',
            color: status === 'err' ? 'var(--danger)' : 'var(--ok)',
            fontSize: '0.95rem',
          }}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

function humanize(err: string): string {
  switch (err) {
    case 'unknown_code': return 'That code doesn\'t match anything — double-check what your terminal printed.';
    case 'expired':       return 'This code has expired. Run `sh1pt login` again to get a fresh one.';
    case 'already_approved': return 'This code was already used. Run `sh1pt login` to start a new pairing.';
    case 'not_signed_in': return 'You\'re not signed in. Sign in first, then come back to this page.';
    default: return err;
  }
}
