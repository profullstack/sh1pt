import { Command } from 'commander';
import kleur from 'kleur';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  getGhToken,
  installPlan,
  openPackPullRequest,
  planDiff,
  renderPack,
  type CatalogEntry,
  type DiffPlan,
  type OpenPrOutcome,
  type RenderInputs,
} from '@profullstack/sh1pt-actions-fleet-core';
import { loadBuiltinPacks } from '@profullstack/sh1pt-action-packs';

export const actionsCmd = new Command('actions')
  .description('Install and manage GitHub Actions workflow packs from the sh1pt Actions Store.');

export interface WorkflowAuditFinding {
  file: string;
  rule: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

async function getCatalogEntry(packId: string): Promise<CatalogEntry> {
  const catalog = await loadBuiltinPacks();
  const entry = catalog.get(packId);
  if (!entry) {
    const available = [...catalog.keys()].sort().join(', ') || '(none)';
    throw new Error(`pack "${packId}" not found. Available: ${available}`);
  }
  return entry;
}

function parseInputPairs(pairs: string[] | undefined): RenderInputs {
  const inputs: RenderInputs = {};
  for (const pair of pairs ?? []) {
    const eq = pair.indexOf('=');
    if (eq <= 0) throw new Error(`invalid --input pair "${pair}", expected key=value`);
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    inputs[key] = value;
  }
  return inputs;
}

function printStatusLine(destination: string, statusKind: string, reason?: string): void {
  const map: Record<string, (s: string) => string> = {
    create: kleur.green,
    'update-managed': kleur.cyan,
    unchanged: kleur.dim,
    'conflict-unmanaged': kleur.yellow,
    'conflict-other-pack': kleur.yellow,
  };
  const colorize = map[statusKind] ?? kleur.white;
  const tag = colorize(statusKind.padEnd(20));
  const suffix = reason ? kleur.dim(` — ${reason}`) : '';
  console.log(`  ${tag} ${destination}${suffix}`);
}

actionsCmd
  .command('list')
  .description('List built-in action packs.')
  .option('--json', 'emit machine-readable JSON')
  .action(async (opts: { json?: boolean }) => {
    const catalog = await loadBuiltinPacks();
    const rows = [...catalog.values()]
      .map((e) => ({
        id: e.manifest.id,
        name: e.manifest.name,
        version: e.manifest.version,
        categories: e.manifest.categories,
        description: e.manifest.description,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    if (opts.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    if (rows.length === 0) {
      console.log(kleur.dim('(no built-in packs)'));
      return;
    }

    for (const row of rows) {
      console.log(`${kleur.bold(row.id)} ${kleur.dim(`v${row.version}`)}`);
      console.log(`  ${row.name} — ${row.description}`);
      console.log(`  ${kleur.dim('categories:')} ${row.categories.join(', ')}`);
      console.log();
    }
  });

actionsCmd
  .command('show')
  .alias('info')
  .description('Show details of a single action pack.')
  .argument('<pack-id>', 'pack id, e.g. node-pnpm-ci')
  .option('--json', 'emit machine-readable JSON')
  .action(async (packId: string, opts: { json?: boolean }) => {
    const { manifest } = await getCatalogEntry(packId);
    if (opts.json) {
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }

    console.log(kleur.bold(`${manifest.name} (${manifest.id}@${manifest.version})`));
    console.log(manifest.description);
    console.log();
    console.log(`${kleur.dim('publisher:')}   ${manifest.publisher}`);
    console.log(`${kleur.dim('visibility:')}  ${manifest.visibility}`);
    console.log(`${kleur.dim('license:')}     ${manifest.license}`);
    console.log(`${kleur.dim('categories:')}  ${manifest.categories.join(', ')}`);
    console.log(`${kleur.dim('pricing:')}     ${manifest.pricing.type}`);

    if (Object.keys(manifest.inputs).length > 0) {
      console.log();
      console.log(kleur.bold('Inputs'));
      for (const [name, def] of Object.entries(manifest.inputs)) {
        const required = def.required ? kleur.yellow(' (required)') : '';
        const dflt = def.default !== undefined ? kleur.dim(` [default: ${def.default}]`) : '';
        const desc = def.description ? ` — ${def.description}` : '';
        console.log(`  ${name}${required}${dflt}${desc}`);
      }
    }

    if (manifest.secrets.length > 0) {
      console.log();
      console.log(kleur.bold('Secrets'));
      for (const s of manifest.secrets) {
        const required = (s.required ?? false) ? kleur.yellow(' (required)') : '';
        const desc = s.description ? ` — ${s.description}` : '';
        console.log(`  ${s.name}${required}${desc}`);
      }
    }

    console.log();
    console.log(kleur.bold('Files'));
    for (const f of manifest.files) {
      console.log(`  ${f.destination}  ${kleur.dim(`← ${f.source} · ${f.mergeStrategy}`)}`);
    }
  });

export function auditWorkflowContent(file: string, content: string): WorkflowAuditFinding[] {
  const findings: WorkflowAuditFinding[] = [];
  const add = (rule: string, severity: WorkflowAuditFinding['severity'], message: string): void => {
    findings.push({ file, rule, severity, message });
  };

  if (!/^permissions\s*:/m.test(content)) {
    add('missing-permissions', 'medium', 'workflow has no top-level permissions block');
  }

  if (/permissions\s*:\s*write-all\b/m.test(content)) {
    add('write-all-permissions', 'high', 'workflow requests `permissions: write-all`');
  }
  if (/^\s*pull_request_target\s*:/m.test(content)) {
    add('pull-request-target', 'high', 'workflow is triggered by `pull_request_target`');
  }

  for (const match of content.matchAll(/uses:\s*([^\s@]+\/[^\s@]+)@(main|master)\b/g)) {
    const actionRef = match[1] ?? 'unknown/action';
    const branchRef = match[2] ?? 'unknown';
    add('unpinned-action-branch', 'high', `action ${actionRef} is pinned to mutable @${branchRef}`);
  }

  if (/\bcurl\b[^\n]*\|\s*(bash|sh)\b/i.test(content)) {
    add('curl-pipe-bash', 'high', 'workflow contains a `curl ... | bash|sh` pattern');
  }
  if (/\bwget\b[^\n]*\|\s*(bash|sh)\b/i.test(content)) {
    add('wget-pipe-bash', 'high', 'workflow contains a `wget ... | bash|sh` pattern');
  }

  for (const match of content.matchAll(/^\s*image:\s*([^\s#]+)\s*(?:#.*)?$/gm)) {
    const image = match[1];
    if (!image) continue;
    if (!image.includes('@sha256:')) {
      add('unpinned-docker-image', 'medium', `image ${image} is not pinned to a digest`);
    }
  }

  return findings;
}

async function findWorkflowFiles(repoDir: string): Promise<string[]> {
  const workflowsDir = join(repoDir, '.github', 'workflows');
  try {
    const entries = await readdir(workflowsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')))
      .map((entry) => join(workflowsDir, entry.name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

actionsCmd
  .command('audit')
  .description('Audit GitHub workflow files for common security risks.')
  .option('-r, --repo <dir>', 'target repo directory', '.')
  .option('--strict', 'exit with non-zero code when findings are present')
  .option('--json', 'emit machine-readable JSON')
  .action(async (opts: { repo: string; strict?: boolean; json?: boolean }) => {
    const repoDir = resolve(opts.repo);
    const files = await findWorkflowFiles(repoDir);
    const findings: WorkflowAuditFinding[] = [];

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      findings.push(...auditWorkflowContent(file, content));
    }

    const result = {
      repoDir,
      filesScanned: files.length,
      findings,
      riskLevel: findings.some((f) => f.severity === 'high')
        ? 'high'
        : findings.some((f) => f.severity === 'medium')
          ? 'medium'
          : findings.length > 0
            ? 'low'
            : 'none',
    } as const;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(kleur.bold(`Audit: ${repoDir}`));
      console.log(kleur.dim(`Scanned ${files.length} workflow file(s)`));
      if (findings.length === 0) {
        console.log(kleur.green('✔ No findings'));
      } else {
        console.log();
        for (const finding of findings) {
          const color = finding.severity === 'high' ? kleur.red : finding.severity === 'medium' ? kleur.yellow : kleur.cyan;
          console.log(`${color(finding.severity.toUpperCase().padEnd(6))} ${finding.file}`);
          console.log(`       ${finding.rule}: ${finding.message}`);
        }
        console.log();
        console.log(`${kleur.bold('Risk level:')} ${result.riskLevel}`);
      }
    }

    if (opts.strict && findings.length > 0) {
      process.exitCode = 1;
    }
  });

async function buildPlan(packId: string, repoOpt: string, inputs: RenderInputs): Promise<DiffPlan> {
  const entry = await getCatalogEntry(packId);
  const repoDir = resolve(repoOpt);
  const render = await renderPack({
    packDir: entry.packDir,
    manifest: entry.manifest,
    inputs,
  });
  return planDiff({ repoDir, render });
}

actionsCmd
  .command('plan')
  .description('Render a pack and show planned file changes vs the target repo (no writes).')
  .argument('<pack-id>', 'pack id')
  .option('-r, --repo <dir>', 'target repo directory', '.')
  .option('-i, --input <pair...>', 'pack input as key=value (repeatable)')
  .option('--json', 'emit machine-readable JSON')
  .action(async (packId: string, opts: { repo: string; input?: string[]; json?: boolean }) => {
    const inputs = parseInputPairs(opts.input);
    const plan = await buildPlan(packId, opts.repo, inputs);

    if (opts.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    console.log(kleur.bold(`Plan: ${plan.packId}@${plan.packVersion} → ${plan.repoDir}`));
    console.log();
    for (const file of plan.files) {
      printStatusLine(file.destination, file.status.kind);
    }
  });

const OWNER_REPO_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/;

function looksLikeOwnerRepo(repo: string): boolean {
  return OWNER_REPO_RE.test(repo);
}

actionsCmd
  .command('install')
  .description(
    'Render and install pack files. Local mode (default): writes to a directory unless --dry-run. ' +
      'Remote mode: pass --repo owner/name --pr to open a pull request via the gh CLI.',
  )
  .argument('<pack-id>', 'pack id')
  .option('-r, --repo <target>', 'local repo directory or owner/name on GitHub', '.')
  .option('-i, --input <pair...>', 'pack input as key=value (repeatable)')
  .option('--dry-run', 'show planned changes without writing (default unless --yes)')
  .option('-y, --yes', 'actually write files (local mode)')
  .option('--pr', 'open a pull request against the remote repo (requires --repo owner/name)')
  .option('--base <branch>', 'base branch when opening a PR (defaults to the repo default branch)')
  .option('--draft', 'open the PR as a draft')
  .option('--force', 'overwrite existing unmanaged or other-pack files')
  .option('--json', 'emit machine-readable JSON')
  .action(async (
    packId: string,
    opts: {
      repo: string;
      input?: string[];
      dryRun?: boolean;
      yes?: boolean;
      pr?: boolean;
      base?: string;
      draft?: boolean;
      force?: boolean;
      json?: boolean;
    },
  ) => {
    const inputs = parseInputPairs(opts.input);

    if (opts.pr || looksLikeOwnerRepo(opts.repo)) {
      if (!looksLikeOwnerRepo(opts.repo)) {
        throw new Error(`--pr requires --repo owner/name, got "${opts.repo}"`);
      }
      await runRemoteInstall(packId, opts.repo, inputs, opts);
      return;
    }

    const plan = await buildPlan(packId, opts.repo, inputs);
    const dryRun = !opts.yes;
    const result = await installPlan(plan, { dryRun, force: opts.force ?? false });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const header = dryRun
      ? kleur.yellow(`Dry-run: ${plan.packId}@${plan.packVersion} → ${plan.repoDir}`)
      : kleur.bold(`Install: ${plan.packId}@${plan.packVersion} → ${plan.repoDir}`);
    console.log(header);
    console.log();
    for (const file of result.files) {
      printStatusLine(file.destination, file.action, file.reason);
    }
    if (dryRun) {
      console.log();
      console.log(kleur.dim('Re-run with --yes to write changes.'));
    }
  });

async function runRemoteInstall(
  packId: string,
  ownerRepo: string,
  inputs: RenderInputs,
  opts: { base?: string; draft?: boolean; force?: boolean; json?: boolean },
): Promise<void> {
  const [owner, repo] = ownerRepo.split('/', 2) as [string, string];
  const entry = await getCatalogEntry(packId);
  const render = await renderPack({ packDir: entry.packDir, manifest: entry.manifest, inputs });

  const token = getGhToken();
  const outcome = await openPackPullRequest({
    client: { token },
    owner,
    repo,
    manifest: entry.manifest,
    render,
    ...(opts.base !== undefined ? { baseBranch: opts.base } : {}),
    ...(opts.draft !== undefined ? { draft: opts.draft } : {}),
    ...(opts.force !== undefined ? { force: opts.force } : {}),
  });

  if (opts.json) {
    console.log(JSON.stringify(outcome, null, 2));
    if (outcome.kind === 'error' || outcome.kind === 'conflict') process.exitCode = 1;
    return;
  }

  printRemoteOutcome(owner, repo, outcome);
}

function printRemoteOutcome(owner: string, repo: string, outcome: OpenPrOutcome): void {
  switch (outcome.kind) {
    case 'opened':
      console.log(kleur.green(`✔ PR opened: ${outcome.pullRequestUrl}`));
      console.log(kleur.dim(`  branch: ${outcome.branch}`));
      console.log();
      for (const file of outcome.plan.files) {
        printStatusLine(file.destination, file.status.kind);
      }
      break;
    case 'unchanged':
      console.log(kleur.dim(`No changes for ${owner}/${repo} — ${outcome.reason}`));
      break;
    case 'conflict':
      console.log(kleur.yellow(`Conflict in ${owner}/${repo}: ${outcome.reason}`));
      for (const file of outcome.plan.files) {
        printStatusLine(file.destination, file.status.kind);
      }
      process.exitCode = 1;
      break;
    case 'error':
      console.log(kleur.red(`Error (${outcome.status}): ${outcome.error}`));
      process.exitCode = 1;
      break;
  }
}
