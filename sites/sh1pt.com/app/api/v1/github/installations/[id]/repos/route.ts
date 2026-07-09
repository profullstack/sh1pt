import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { authorizeInstallation, listInstallationRepos } from '@/lib/github-installation';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await authorizeInstallation(id);
  if (auth instanceof NextResponse) return auth;

  const repos = await listInstallationRepos(auth.installation);
  if (!repos.ok) {
    return NextResponse.json({ error: repos.error }, { status: repos.status });
  }

  // Pull current user selections so the UI knows which boxes to check.
  const admin = getSupabaseServiceClient();
  const { data: selectedRows } = await admin
    .from('github_installation_repos')
    .select('github_repo_id')
    .eq('installation_pk', auth.installation.id);
  const selectedSet = new Set((selectedRows ?? []).map((r) => r.github_repo_id));

  return NextResponse.json({
    installation: {
      id: auth.installation.id,
      account_login: auth.installation.account_login,
      account_type: auth.installation.account_type,
      repository_selection: auth.installation.repository_selection,
    },
    repos: repos.repos.map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: r.private,
      default_branch: r.default_branch,
      archived: r.archived,
      selected: selectedSet.has(r.id),
    })),
  });
}
