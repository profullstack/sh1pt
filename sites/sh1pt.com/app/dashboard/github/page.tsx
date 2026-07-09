import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadBuiltinPacks } from '@profullstack/sh1pt-action-packs';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import ActionInstallPanel, { type ActionOption, type RepoOption } from './ActionInstallPanel';

export const metadata = {
  title: 'GitHub installations — sh1pt',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface Installation {
  id: string;
  installation_id: number;
  account_login: string;
  account_type: 'User' | 'Organization';
  account_avatar_url: string | null;
  repository_selection: 'all' | 'selected';
  status: 'active' | 'suspended' | 'deleted';
  created_at: string;
  updated_at: string;
}

interface SelectedRepo {
  installation_pk: string;
  github_repo_id: number;
  full_name: string;
  private: boolean;
  archived: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_installation: 'GitHub did not return an installation_id. Try again.',
  bad_state: 'CSRF check failed. Start the install flow from the Connect button.',
  app_not_configured: 'sh1pt GitHub App is not configured. Ask an admin to set it up.',
  lookup_failed: 'Could not load the installation from GitHub. Try again.',
  persist_failed: 'Could not save the installation. Try again.',
  no_profile: 'No profile found for your account.',
};

export default async function GithubInstallationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/github');

  const admin = getSupabaseServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle<{ id: string }>();
  if (!profile) redirect('/dashboard?error=no_profile');

  const { data: rows } = await admin
    .from('github_installations')
    .select(
      'id, installation_id, account_login, account_type, account_avatar_url, repository_selection, status, created_at, updated_at',
    )
    .eq('profile_id', profile.id)
    .order('updated_at', { ascending: false });

  const installations = (rows ?? []) as Installation[];
  const installationIds = installations.map((inst) => inst.id);
  const { data: selectedRepoRows } = installationIds.length
    ? await admin
        .from('github_installation_repos')
        .select('installation_pk, github_repo_id, full_name, private, archived')
        .in('installation_pk', installationIds)
        .order('full_name', { ascending: true })
    : { data: [] };

  const selectedReposByInstallation = new Map<string, SelectedRepo[]>();
  for (const repo of (selectedRepoRows ?? []) as SelectedRepo[]) {
    const repos = selectedReposByInstallation.get(repo.installation_pk) ?? [];
    repos.push(repo);
    selectedReposByInstallation.set(repo.installation_pk, repos);
  }

  const catalog = await loadBuiltinPacks();
  const actions: ActionOption[] = [...catalog.values()]
    .map((entry) => ({
      id: entry.manifest.id,
      name: entry.manifest.name,
      description: entry.manifest.description,
      version: entry.manifest.version,
      categories: entry.manifest.categories,
      destinations: entry.manifest.files.map((file) => file.destination),
      secrets: entry.manifest.secrets.map((secret) => secret.name),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const selectedRepos: RepoOption[] = ((selectedRepoRows ?? []) as SelectedRepo[])
    .map((repo) => ({
      installationPk: repo.installation_pk,
      repoId: repo.github_repo_id,
      fullName: repo.full_name,
      private: repo.private,
      archived: repo.archived,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const params = await searchParams;
  const installed = params.installed === '1';
  const errorKey = typeof params.error === 'string' ? params.error : null;
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Error: ${errorKey}` : null;

  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, maxWidth: 760 }}>
      <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', margin: 0 }}>GitHub installations</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        Orgs and users where you've installed the sh1pt Actions Fleet app.
      </p>

      {installed && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: '1px solid rgba(74,222,128,0.4)',
            background: 'rgba(74,222,128,0.08)',
            borderRadius: 8,
            fontSize: '0.9rem',
          }}
        >
          ✓ Installation saved. Pick repos below.
        </div>
      )}

      {errorMessage && (
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
          {errorMessage}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard/connect/github" className="btn">
          + Add a GitHub installation
        </Link>
      </div>

      {installations.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          No installations yet. Click <strong>Add a GitHub installation</strong> to get started.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 24, display: 'grid', gap: 12 }}>
          {installations.map((inst) => (
            <li
              key={inst.id}
              style={{
                padding: 16,
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                {inst.account_avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={inst.account_avatar_url}
                    alt=""
                    width={40}
                    height={40}
                    style={{ borderRadius: '50%', display: 'block' }}
                  />
                ) : null}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <strong>{inst.account_login}</strong>
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      {inst.account_type === 'Organization' ? 'org' : 'user'} ·{' '}
                      {inst.repository_selection === 'all' ? 'all repos' : 'selected repos'}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                    Installation #{inst.installation_id} · status {inst.status}
                  </div>
                  {(() => {
                    const selectedRepos = selectedReposByInstallation.get(inst.id) ?? [];
                    return selectedRepos.length > 0 ? (
                      <div style={{ marginTop: 12 }}>
                        <div className="muted" style={{ fontSize: '0.75rem', marginBottom: 6 }}>
                          {selectedRepos.length} selected repo{selectedRepos.length === 1 ? '' : 's'}
                        </div>
                        <ul
                          style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0,
                            display: 'flex',
                            gap: 6,
                            flexWrap: 'wrap',
                          }}
                        >
                          {selectedRepos.map((repo) => (
                            <li
                              key={repo.github_repo_id}
                              style={{
                                padding: '4px 7px',
                                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.03)',
                                fontSize: '0.75rem',
                              }}
                            >
                              <code>{repo.full_name}</code>
                              {repo.private ? (
                                <span className="muted" style={{ marginLeft: 6 }}>
                                  private
                                </span>
                              ) : null}
                              {repo.archived ? (
                                <span className="muted" style={{ marginLeft: 6 }}>
                                  archived
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 12 }}>
                        No repos selected yet.
                      </div>
                    );
                  })()}
                </div>
              </div>
              <Link
                href={`/dashboard/github/repos?installation=${inst.id}`}
                className="btn secondary"
                style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                Pick repos →
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ActionInstallPanel actions={actions} repos={selectedRepos} />

      <p style={{ marginTop: 32, fontSize: '0.85rem' }}>
        <Link href="/dashboard" className="muted">
          ← Back to dashboard
        </Link>
      </p>
    </main>
  );
}
