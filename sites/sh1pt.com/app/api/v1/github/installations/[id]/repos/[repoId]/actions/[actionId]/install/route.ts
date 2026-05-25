import { NextRequest, NextResponse } from 'next/server';
import { loadBuiltinPacks } from '@profullstack/sh1pt-action-packs';
import {
  openPackPullRequest,
  renderPack,
  type RenderInputs,
} from '@profullstack/sh1pt-actions-fleet-core';
import { authorizeInstallation } from '@/lib/github-installation';
import { mintInstallationToken } from '@/lib/github-app';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

interface InstallBody {
  inputs?: Record<string, string>;
  draft?: boolean;
  force?: boolean;
}

interface SelectedRepoRow {
  github_repo_id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string | null;
  archived: boolean;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; repoId: string; actionId: string }> },
) {
  const { id, repoId, actionId } = await context.params;
  const auth = await authorizeInstallation(id);
  if (auth instanceof NextResponse) return auth;

  const githubRepoId = Number.parseInt(repoId, 10);
  if (!Number.isFinite(githubRepoId)) {
    return NextResponse.json({ error: 'Invalid repo id' }, { status: 400 });
  }

  let body: InstallBody;
  try {
    body = (await req.json()) as InstallBody;
  } catch {
    body = {};
  }

  const inputs = normalizeInputs(body.inputs);
  if (!inputs.ok) {
    return NextResponse.json({ error: inputs.error }, { status: 400 });
  }

  const admin = getSupabaseServiceClient();
  const { data: repo } = await admin
    .from('github_installation_repos')
    .select('github_repo_id, owner, name, full_name, default_branch, archived')
    .eq('installation_pk', auth.installation.id)
    .eq('github_repo_id', githubRepoId)
    .maybeSingle<SelectedRepoRow>();

  if (!repo) {
    return NextResponse.json({ error: 'Repo is not selected for this installation' }, { status: 404 });
  }
  if (repo.archived) {
    return NextResponse.json({ error: 'Archived repos cannot be modified' }, { status: 400 });
  }

  const catalog = await loadBuiltinPacks();
  const entry = catalog.get(actionId);
  if (!entry) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 404 });
  }
  if (!entry.manifest.compatibility.providers.includes('github')) {
    return NextResponse.json({ error: 'Action does not support GitHub' }, { status: 400 });
  }

  let render;
  try {
    render = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: inputs.value,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Render failed' },
      { status: 400 },
    );
  }

  const token = await mintInstallationToken(auth.installation.installation_id);
  if (!token.ok || !token.data) {
    return NextResponse.json({ error: token.error ?? 'Could not mint installation token' }, { status: token.status || 500 });
  }
  if (token.data.permissions) {
    const { error: updateError } = await admin
      .from('github_installations')
      .update({ permissions: token.data.permissions, updated_at: new Date().toISOString() })
      .eq('id', auth.installation.id);

    if (updateError) {
      console.error('Failed to persist refreshed GitHub installation permissions', {
        installationId: auth.installation.id,
        githubInstallationId: auth.installation.installation_id,
        error: updateError,
      });
    }
  }
  if (
    requiresWorkflowWrite(entry.manifest.files) &&
    !hasFreshWorkflowWrite(token.data.permissions, auth.installation.permissions)
  ) {
    return NextResponse.json(
      {
        error:
          'GitHub App needs Workflows: write permission to install actions into .github/workflows. Update the sh1pt GitHub App permissions, accept the installation update in GitHub, then retry.',
      },
      { status: 403 },
    );
  }

  const outcome = await openPackPullRequest({
    client: { token: token.data.token },
    owner: repo.owner,
    repo: repo.name,
    manifest: entry.manifest,
    render,
    ...(repo.default_branch ? { baseBranch: repo.default_branch } : {}),
    draft: body.draft ?? false,
    force: body.force ?? false,
  });

  if (outcome.kind === 'error') {
    if (
      outcome.status === 403 &&
      typeof outcome.error === 'string' &&
      outcome.error.includes('Resource not accessible by integration')
    ) {
      return NextResponse.json(
        {
          ...outcome,
          error:
            'GitHub App needs Workflows: write permission to install actions into .github/workflows. Update the sh1pt GitHub App permissions, accept the installation update in GitHub, then retry.',
        },
        { status: 403 },
      );
    }
    return NextResponse.json(outcome, { status: outcome.status || 500 });
  }
  if (outcome.kind === 'conflict') {
    return NextResponse.json(outcome, { status: 409 });
  }
  return NextResponse.json(outcome);
}

function requiresWorkflowWrite(files: Array<{ destination: string }>): boolean {
  return files.some((file) => file.destination.replace(/^\/+/, '').startsWith('.github/workflows/'));
}

function hasWorkflowWrite(permissions: Record<string, string> | null | undefined): boolean {
  return permissions?.workflows === 'write';
}

function hasFreshWorkflowWrite(
  tokenPermissions: Record<string, string> | null | undefined,
  storedPermissions: Record<string, string> | null | undefined,
): boolean {
  if (tokenPermissions) return hasWorkflowWrite(tokenPermissions);
  return hasWorkflowWrite(storedPermissions);
}

function normalizeInputs(value: unknown): { ok: true; value: RenderInputs } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'inputs must be an object' };
  }
  const inputs: RenderInputs = {};
  for (const [key, inputValue] of Object.entries(value)) {
    if (typeof inputValue !== 'string') {
      return { ok: false, error: `input ${key} must be a string` };
    }
    inputs[key] = inputValue;
  }
  return { ok: true, value: inputs };
}
