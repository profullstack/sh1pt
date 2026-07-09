'use client';

import { useMemo, useState } from 'react';

export interface RepoRow {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  archived: boolean;
  selected: boolean;
}

interface Props {
  installationPk: string;
  initialRepos: RepoRow[];
}

export default function RepoPicker({ installationPk, initialRepos }: Props) {
  const [repos, setRepos] = useState<RepoRow[]>(initialRepos);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [repos, query]);

  const selectedCount = repos.filter((r) => r.selected).length;

  const toggle = (id: number) => {
    setRepos((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
    setMessage(null);
  };

  const selectAllFiltered = () => {
    const filteredIds = new Set(filtered.map((r) => r.id));
    setRepos((prev) => prev.map((r) => (filteredIds.has(r.id) ? { ...r, selected: true } : r)));
    setMessage(null);
  };

  const deselectAllFiltered = () => {
    const filteredIds = new Set(filtered.map((r) => r.id));
    setRepos((prev) => prev.map((r) => (filteredIds.has(r.id) ? { ...r, selected: false } : r)));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const selectedIds = repos.filter((r) => r.selected).map((r) => r.id);
      const res = await fetch(
        `/api/v1/github/installations/${encodeURIComponent(installationPk)}/selections`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedRepoIds: selectedIds }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        setMessage(`Save failed: ${text || res.statusText}`);
        return;
      }
      const data = (await res.json()) as { count?: number };
      setMessage(`✓ Saved ${data.count ?? selectedIds.length} repos`);
    } catch {
      setMessage('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      style={{
        marginTop: 24,
        padding: 20,
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          style={{
            flex: '1 1 200px',
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid var(--border, rgba(255,255,255,0.1))',
            borderRadius: 6,
            color: 'inherit',
            fontSize: '0.9rem',
          }}
        />
        <button
          className="btn secondary"
          onClick={selectAllFiltered}
          style={{ fontSize: '0.8rem' }}
          disabled={filtered.length === 0}
        >
          Select all{query ? ' filtered' : ''}
        </button>
        <button
          className="btn secondary"
          onClick={deselectAllFiltered}
          style={{ fontSize: '0.8rem' }}
          disabled={filtered.length === 0}
        >
          Deselect all{query ? ' filtered' : ''}
        </button>
      </div>

      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
        {selectedCount} of {repos.length} selected
        {query && filtered.length !== repos.length ? ` · ${filtered.length} visible` : ''}
      </div>

      {filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No repos match this filter.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            marginTop: 16,
            display: 'grid',
            gap: 4,
            maxHeight: 480,
            overflowY: 'auto',
          }}
        >
          {filtered.map((r) => (
            <li
              key={r.id}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border, rgba(255,255,255,0.05))',
                borderRadius: 6,
                background: r.selected ? 'rgba(74,222,128,0.05)' : 'transparent',
              }}
            >
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={r.selected}
                  onChange={() => toggle(r.id)}
                  disabled={r.archived}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <code style={{ fontSize: '0.85rem' }}>{r.full_name}</code>
                  {r.private ? (
                    <span className="muted" style={{ fontSize: '0.7rem', marginLeft: 8 }}>
                      private
                    </span>
                  ) : null}
                  {r.archived ? (
                    <span className="muted" style={{ fontSize: '0.7rem', marginLeft: 8 }}>
                      archived
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save selection'}
        </button>
        {message && (
          <span
            className="muted"
            style={{ fontSize: '0.85rem', color: message.startsWith('✓') ? '#4ade80' : '#f87171' }}
          >
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
