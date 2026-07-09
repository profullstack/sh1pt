'use client';

import { useState } from 'react';

type Props = {
  command: string;
  label?: string;
};

export default function CopyableCommand({ command, label }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked (e.g. insecure context). Silent fall-through —
      // user can still select the text manually.
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {label ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
      ) : null}
      <pre style={{ margin: 0, paddingRight: '5rem' }}>{command}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy command"
        style={{
          position: 'absolute',
          top: label ? '1.7rem' : '0.5rem',
          right: '0.5rem',
          background: copied ? 'var(--lime)' : 'var(--border)',
          color: copied ? '#031019' : 'var(--fg)',
          border: 0,
          padding: '0.3rem 0.7rem',
          borderRadius: 6,
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 120ms ease',
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}
