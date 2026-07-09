import 'server-only';
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from './supabase/server';
import { getSupabaseServiceClient } from './supabase/service';
import {
  githubFetch,
  mintInstallationToken,
  isGithubAppConfigured,
} from './github-app';

export interface InstallationRow {
  id: string;
  profile_id: string;
  installation_id: number;
  account_login: string;
  account_type: 'User' | 'Organization';
  repository_selection: 'all' | 'selected';
  status: 'active' | 'suspended' | 'deleted';
  permissions?: Record<string, string> | null;
}

export interface GithubRepoResult {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  archived: boolean;
}

interface InstallationsListResult {
  total_count: number;
  repositories: GithubRepoResult[];
}

/**
 * Authenticate the current user, then load an installation row by its PK
 * (the github_installations.id, not GitHub's installation_id). Returns
 * the row + profile_id, or a NextResponse for the caller to return.
 */
export async function authorizeInstallation(
  installationPk: string,
): Promise<{ profile_id: string; installation: InstallationRow } | NextResponse> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = getSupabaseServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle<{ id: string }>();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const { data: installation } = await admin
    .from('github_installations')
    .select(
      'id, profile_id, installation_id, account_login, account_type, repository_selection, status, permissions',
    )
    .eq('id', installationPk)
    .eq('profile_id', profile.id)
    .maybeSingle<InstallationRow>();
  if (!installation) {
    return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
  }

  if (!isGithubAppConfigured()) {
    return NextResponse.json({ error: 'GitHub App not configured' }, { status: 500 });
  }

  return { profile_id: profile.id, installation };
}

/**
 * Fetch all repos accessible via an installation token, paginating through
 * /installation/repositories. Returns deduplicated repos sorted by full_name.
 */
export async function listInstallationRepos(
  installation: InstallationRow,
): Promise<{ ok: true; repos: GithubRepoResult[] } | { ok: false; error: string; status: number }> {
  if (!isGithubAppConfigured()) {
    return { ok: false, status: 500, error: 'GitHub App credentials missing' };
  }

  const tokenResp = await mintInstallationToken(installation.installation_id);
  if (!tokenResp.ok || !tokenResp.data) {
    return { ok: false, status: tokenResp.status || 500, error: tokenResp.error ?? 'Token mint failed' };
  }
  const installationToken = tokenResp.data.token;

  const all: GithubRepoResult[] = [];
  let page = 1;
  const perPage = 100;
  while (page <= 50) {
    const result = await githubFetch<InstallationsListResult>(
      `/installation/repositories?per_page=${perPage}&page=${page}`,
      { token: installationToken },
    );
    if (!result.ok || !result.data) {
      return { ok: false, status: result.status || 500, error: result.error ?? 'Repo list failed' };
    }
    all.push(...result.data.repositories);
    if (result.data.repositories.length < perPage) break;
    page++;
  }

  all.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { ok: true, repos: all };
}
