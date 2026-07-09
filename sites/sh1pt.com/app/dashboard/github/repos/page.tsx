import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { isGithubAppConfigured } from '@/lib/github-app';
import { listInstallationRepos, type InstallationRow } from '@/lib/github-installation';
import RepoPicker from './RepoPicker';

export const metadata = {
  title: 'Pick repos — sh1pt',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PickReposPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const installationPk = typeof params.installation === 'string' ? params.installation : null;
  if (!installationPk) redirect('/dashboard/github');

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/github/repos?installation=${installationPk}`);

  const admin = getSupabaseServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle<{ id: string }>();
  if (!profile) redirect('/dashboard?error=no_profile');

  const { data: installation } = await admin
    .from('github_installations')
    .select(
      'id, profile_id, installation_id, account_login, account_type, repository_selection, status',
    )
    .eq('id', installationPk)
    .eq('profile_id', profile.id)
    .maybeSingle<InstallationRow>();
  if (!installation) redirect('/dashboard/github?error=missing_installation');

  if (!isGithubAppConfigured()) redirect('/dashboard/github?error=app_not_configured');

  const reposResult = await listInstallationRepos(installation);
  if (!reposResult.ok) {
    return (
      <main className="container" style={{ paddingTop: 80, paddingBottom: 80, maxWidth: 760 }}>
        <h1 style={{ margin: 0 }}>Pick repos</h1>
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
          Could not load repos from GitHub: {reposResult.error}
        </div>
        <p style={{ marginTop: 24, fontSize: '0.85rem' }}>
          <Link href="/dashboard/github" className="muted">
            ← Back
          </Link>
        </p>
      </main>
    );
  }

  const { data: selectedRows } = await admin
    .from('github_installation_repos')
    .select('github_repo_id')
    .eq('installation_pk', installation.id);
  const selectedSet = new Set((selectedRows ?? []).map((r) => r.github_repo_id));

  const repos = reposResult.repos.map((r) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    private: r.private,
    default_branch: r.default_branch,
    archived: r.archived,
    selected: selectedSet.has(r.id),
  }));

  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, maxWidth: 760 }}>
      <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', margin: 0 }}>
        Pick repos for {installation.account_login}
      </h1>
      <p className="muted" style={{ marginTop: 8 }}>
        {repos.length} repo{repos.length === 1 ? '' : 's'} accessible via this installation. Select
        the ones sh1pt should manage.
      </p>

      <RepoPicker installationPk={installation.id} initialRepos={repos} />

      <p style={{ marginTop: 24, fontSize: '0.85rem' }}>
        <Link href="/dashboard/github" className="muted">
          ← Back to installations
        </Link>
      </p>
    </main>
  );
}
