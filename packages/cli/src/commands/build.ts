import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import type { ResolvedInput } from '../input.js';
import { entityCmd } from './entity.js';
import { createActionsCmd } from './build-actions.js';

function run(argv: string[], env?: Record<string, string>): number {
  console.log(kleur.cyan(`→ ${argv.join(' ')}`));
  const [cmd, ...rest] = argv;
  if (!cmd) throw new Error('empty command');
  const r = spawnSync(cmd, rest, {
    stdio: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  });
  return r.status ?? 0;
}

// --- Stack detection ---------------------------------------------------------

export interface DetectedStack {
  /** Primary runtime/language detected. */
  runtime: string;
  /** Package manager or build tool, if identifiable. */
  packageManager?: string;
  /** Project name from the manifest. */
  projectName?: string;
}

/**
 * Inspect a directory root and return detected stack info based on manifest
 * files. Returns undefined if nothing recognizable is found.
 */
export function detectStack(dir: string): DetectedStack | undefined {
  // Node (package.json)
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const pm = typeof pkg['packageManager'] === 'string'
        ? pkg['packageManager'].split('@')[0]
        : existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm'
        : existsSync(join(dir, 'yarn.lock')) ? 'yarn'
        : 'npm';
      return {
        runtime: 'node',
        packageManager: pm,
        projectName: typeof pkg['name'] === 'string' ? pkg['name'] : undefined,
      };
    } catch { /* malformed json — skip */ }
  }

  // Python (pyproject.toml)
  const pyPath = join(dir, 'pyproject.toml');
  if (existsSync(pyPath)) {
    try {
      const content = readFileSync(pyPath, 'utf-8');
      const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
      return {
        runtime: 'python',
        packageManager: content.includes('[tool.poetry]') ? 'poetry' : 'pip',
        projectName: nameMatch?.[1],
      };
    } catch { /* skip */ }
  }

  // Rust (Cargo.toml)
  const cargoPath = join(dir, 'Cargo.toml');
  if (existsSync(cargoPath)) {
    try {
      const content = readFileSync(cargoPath, 'utf-8');
      const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
      return {
        runtime: 'rust',
        packageManager: 'cargo',
        projectName: nameMatch?.[1],
      };
    } catch { /* skip */ }
  }

  // Go (go.mod)
  const goPath = join(dir, 'go.mod');
  if (existsSync(goPath)) {
    try {
      const content = readFileSync(goPath, 'utf-8');
      const modMatch = content.match(/^module\s+(\S+)/m);
      const modName = modMatch?.[1];
      return {
        runtime: 'go',
        packageManager: 'go',
        projectName: modName ? modName.split('/').pop() : undefined,
      };
    } catch { /* skip */ }
  }

  return undefined;
}

// --- Git clone ---------------------------------------------------------------

export interface CloneResult {
  cloneDir: string;
  stack: DetectedStack | undefined;
  projectName: string;
}

/**
 * Shallow-clone a git repo into a temp directory and detect the stack.
 * Throws on clone failure.
 */
export function cloneAndDetect(input: ResolvedInput): CloneResult {
  const name = input.inferredName ?? 'repo';
  const rand = randomBytes(4).toString('hex');
  const cloneDir = join(tmpdir(), `sh1pt-build-${name}-${rand}`);

  const result = spawnSync('git', ['clone', '--depth=1', input.value, cloneDir], {
    stdio: 'pipe',
    timeout: 60_000,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim() ?? 'unknown error';
    throw new Error(`git clone failed: ${stderr}`);
  }

  const stack = detectStack(cloneDir);
  const projectName = stack?.projectName ?? name;

  return { cloneDir, stack, projectName };
}

// --- Command -----------------------------------------------------------------

export const buildCmd = new Command('build')
  .description('Build one or more targets locally or in the sh1pt cloud')
  .option('-t, --target <id...>', 'target ids to build (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--cloud', 'run build in sh1pt cloud instead of locally')
  .option('--from <input>', 'existing git repo, live url, local path, or manifest doc to build from')
  .option('--keep-clone', 'keep the cloned repo instead of cleaning up after build')
  .action((opts: { target?: string[]; channel: string; cloud?: boolean; from?: string; keepClone?: boolean }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    const where = opts.cloud ? 'cloud' : 'local';
    if (opts.from) {
      const input = resolveInput(opts.from);

      if (input.kind === 'git') {
        const { cloneDir, stack, projectName } = cloneAndDetect(input);

        console.log(kleur.green('✔ Cloned successfully'));
        console.log();
        console.log(kleur.bold('Build summary'));
        console.log(`  project:  ${projectName}`);
        console.log(`  stack:    ${stack ? `${stack.runtime} (${stack.packageManager ?? 'unknown'})` : 'unknown'}`);
        console.log(`  channel:  ${opts.channel}`);
        console.log(`  target:   ${where}`);
        console.log(`  clone:    ${cloneDir}`);

        if (!opts.keepClone) {
          rmSync(cloneDir, { recursive: true, force: true });
          console.log(kleur.dim('  (clone removed — use --keep-clone to retain)'));
        }
        return;
      }

      // Other kinds remain stubs for now.
      console.log(kleur.cyan(`[stub] build (${where}) · channel=${opts.channel} · from=${describeInput(input)}`));
      // TODO: kind==='path' → load manifest; kind==='doc' → parse manifest;
      // kind==='url' → HEAD/fetch to infer stack.
      return;
    }
    console.log(kleur.cyan(`[stub] build (${where}) · channel=${opts.channel} · targets=${targets}`));
    // TODO: load manifest, resolve targets, invoke Target.build(), stream logs
  });

// Entity-ops lives under `build` — an entity (certificate, bylaws, filing
// packet, checklist) is an artifact the CLI produces, so it fits the build
// verb. See docs/prd/entityctl.md.
buildCmd.addCommand(entityCmd);

// Actions Store / Actions Fleet — install GitHub Actions workflow packs.
// See docs/prd/actions-fleet.md.
buildCmd.addCommand(createActionsCmd());

// Maintainer ops — lockstep version bump for the three published sh1pt
// packages (core / policy / cli). Wraps the root-level `pnpm version:*`
// scripts; only works from inside the sh1pt repo. The matching publish
// flow lives under `sh1pt promote publish npm` (publishing IS promotion).

for (const bump of ['patch', 'minor', 'major'] as const) {
  buildCmd
    .command(`version:${bump}`)
    .description(`Bump ${bump} version of core/policy/cli in lockstep + regenerate pnpm-lock`)
    .action(() => {
      process.exit(run(['pnpm', `version:${bump}`]));
    });
}

// Re-export the `run` helper so promote.ts can shell out without
// duplicating the spawnSync wiring.
export { run as runShell };
