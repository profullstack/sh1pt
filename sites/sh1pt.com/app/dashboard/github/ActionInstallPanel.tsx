'use client';

import { useMemo, useState } from 'react';

export interface ActionOption {
  id: string;
  name: string;
  description: string;
  version: string;
  categories: string[];
  destinations: string[];
  secrets: string[];
}

export interface RepoOption {
  installationPk: string;
  repoId: number;
  fullName: string;
  private: boolean;
  archived: boolean;
}

interface InstallResponse {
  kind?: 'opened' | 'unchanged' | 'conflict' | 'error';
  pullRequestUrl?: string;
  branch?: string;
  number?: number;
  reason?: string;
  error?: string;
}

interface Props {
  actions: ActionOption[];
  repos: RepoOption[];
}

export default function ActionInstallPanel({ actions, repos }: Props) {
  const availableRepos = useMemo(() => repos.filter((repo) => !repo.archived), [repos]);
  const [selectedRepoKey, setSelectedRepoKey] = useState(() => {
    const repo = availableRepos[0];
    return repo ? repoKey(repo) : '';
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pullRequestUrl, setPullRequestUrl] = useState<string | null>(null);

  const selectedRepo = availableRepos.find((repo) => repoKey(repo) === selectedRepoKey);

  async function install(actionId: string) {
    if (!selectedRepo) return;
    setBusyAction(actionId);
    setMessage(null);
    setPullRequestUrl(null);
    try {
      const res = await fetch(
        `/api/v1/github/installations/${encodeURIComponent(selectedRepo.installationPk)}/repos/${encodeURIComponent(String(selectedRepo.repoId))}/actions/${encodeURIComponent(actionId)}/install`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: {} }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as InstallResponse;
      if (!res.ok) {
        setMessage(data.error || data.reason || `Install failed (${res.status})`);
        return;
      }
      if (data.kind === 'opened' && data.pullRequestUrl) {
        setMessage(`PR #${data.number ?? '?'} opened`);
        setPullRequestUrl(data.pullRequestUrl);
      } else if (data.kind === 'unchanged') {
        setMessage(data.reason || 'Already installed');
      } else if (data.kind === 'conflict') {
        setMessage(data.reason || 'Install has a file conflict');
      } else {
        setMessage(data.error || 'Install finished');
      }
    } catch {
      setMessage('Network error');
    } finally {
      setBusyAction(null);
    }
  }

  if (actions.length === 0 || repos.length === 0) return null;

  return (
    <section
      style={{
        marginTop: 28,
        padding: 16,
        border: '1px solid var(--border, rgba(255,255,255,0.08))',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.16)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Install actions</h2>
          <div className="muted" style={{ marginTop: 4, fontSize: '0.78rem' }}>
            {actions.length} action{actions.length === 1 ? '' : 's'} available
          </div>
        </div>
        <label style={{ display: 'grid', gap: 6, minWidth: 260 }}>
          <span className="muted" style={{ fontSize: '0.75rem' }}>
            Repo
          </span>
          <select
            value={selectedRepoKey}
            onChange={(event) => {
              setSelectedRepoKey(event.target.value);
              setMessage(null);
              setPullRequestUrl(null);
            }}
            style={{
              minHeight: 36,
              borderRadius: 6,
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
              background: 'rgba(0,0,0,0.35)',
              color: 'inherit',
              padding: '0 10px',
            }}
          >
            {availableRepos.map((repo) => (
              <option key={repoKey(repo)} value={repoKey(repo)}>
                {repo.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {availableRepos.length === 0 ? (
        <p className="muted" style={{ marginTop: 16, fontSize: '0.85rem' }}>
          No selectable repos.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          {actions.map((action) => (
            <div
              key={action.id}
              style={{
                padding: 12,
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 8,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>{action.name}</strong>
                  <code className="muted" style={{ fontSize: '0.72rem' }}>
                    {action.id}@{action.version}
                  </code>
                </div>
                <div className="muted" style={{ marginTop: 4, fontSize: '0.78rem' }}>
                  {action.description}
                </div>
                <div className="muted" style={{ marginTop: 6, fontSize: '0.72rem' }}>
                  {action.destinations.join(', ')}
                  {action.secrets.length ? ` · secrets: ${action.secrets.join(', ')}` : ''}
                </div>
              </div>
              <button
                className="btn secondary"
                style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                disabled={!selectedRepo || busyAction !== null}
                onClick={() => install(action.id)}
              >
                {busyAction === action.id ? 'Installing...' : 'Install'}
              </button>
            </div>
          ))}
        </div>
      )}

      {message ? (
        <div
          style={{
            marginTop: 14,
            fontSize: '0.85rem',
            color: pullRequestUrl ? '#4ade80' : 'var(--muted)',
          }}
        >
          {message}
          {pullRequestUrl ? (
            <>
              {' '}
              <a href={pullRequestUrl} target="_blank" rel="noreferrer">
                Open PR
              </a>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function repoKey(repo: RepoOption): string {
  return `${repo.installationPk}:${repo.repoId}`;
}
