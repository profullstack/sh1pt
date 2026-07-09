import type { ReactNode } from 'react';
import CopyableCommand from './CopyableCommand';

type Option = { flag: string; description: string };
type Example = { label?: string; command: string };

type Props = {
  signature: string;
  description: ReactNode;
  options?: Option[];
  examples?: Example[];
};

export default function CommandBlock({ signature, description, options, examples }: Props) {
  return (
    <div style={{ marginBottom: '2.25rem', paddingTop: '0.5rem' }}>
      <div
        style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--fg)',
          marginBottom: '0.4rem',
        }}
      >
        {signature}
      </div>
      <p className="muted" style={{ margin: '0 0 0.75rem', maxWidth: 760 }}>
        {description}
      </p>
      {options?.length ? (
        <ul className="muted" style={{ paddingLeft: '1.2rem', margin: '0 0 0.85rem', fontSize: '0.9rem' }}>
          {options.map((o) => (
            <li key={o.flag} style={{ marginBottom: '0.2rem' }}>
              <code>{o.flag}</code> — {o.description}
            </li>
          ))}
        </ul>
      ) : null}
      {examples?.length
        ? (
          <div style={{ display: 'grid', gap: '0.5rem', maxWidth: 760 }}>
            {examples.map((ex, i) => (
              <CopyableCommand key={i} label={ex.label} command={ex.command} />
            ))}
          </div>
        )
        : null}
    </div>
  );
}
