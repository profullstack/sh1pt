import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { authorizeInstallation, listInstallationRepos } from '@/lib/github-installation';

interface PutBody {
  selectedRepoIds?: number[];
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await authorizeInstallation(id);
  if (auth instanceof NextResponse) return auth;

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const ids = Array.isArray(body.selectedRepoIds)
    ? body.selectedRepoIds.filter((n) => typeof n === 'number' && Number.isFinite(n))
    : null;
  if (!ids) {
    return NextResponse.json({ error: 'selectedRepoIds must be number[]' }, { status: 400 });
  }

  // Validate that every chosen id is actually visible to this installation —
  // prevents a malicious client from inserting arbitrary repo records.
  const repos = await listInstallationRepos(auth.installation);
  if (!repos.ok) {
    return NextResponse.json({ error: repos.error }, { status: repos.status });
  }
  const byId = new Map(repos.repos.map((r) => [r.id, r]));
  const validIds = ids.filter((id) => byId.has(id));

  const admin = getSupabaseServiceClient();

  // Replace-by-set: delete rows not in new set, then upsert chosen ones.
  const { data: existingRows } = await admin
    .from('github_installation_repos')
    .select('id, github_repo_id')
    .eq('installation_pk', auth.installation.id);
  const existing = existingRows ?? [];
  const newSet = new Set(validIds);
  const toDelete = existing.filter((r) => !newSet.has(r.github_repo_id)).map((r) => r.id);
  if (toDelete.length > 0) {
    const { error } = await admin
      .from('github_installation_repos')
      .delete()
      .in('id', toDelete);
    if (error) {
      console.error('[selections] delete failed', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const upserts = validIds.map((repoId) => {
    const r = byId.get(repoId)!;
    return {
      installation_pk: auth.installation.id,
      github_repo_id: r.id,
      owner: r.owner.login,
      name: r.name,
      full_name: r.full_name,
      private: r.private,
      default_branch: r.default_branch,
      archived: r.archived,
    };
  });
  if (upserts.length > 0) {
    const { error } = await admin
      .from('github_installation_repos')
      .upsert(upserts, { onConflict: 'installation_pk,github_repo_id' });
    if (error) {
      console.error('[selections] upsert failed', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, count: validIds.length });
}
