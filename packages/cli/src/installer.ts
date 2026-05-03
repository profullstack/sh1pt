// Auto-install + load adapters on demand.
//
// Adapter packages aren't dependencies of the sh1pt meta-package — that
// would balloon every install to ~175 packages. Instead, we install on
// first use: when a command needs `@profullstack/sh1pt-social-x`, it
// calls ensureInstalled(['@profullstack/sh1pt-social-x']), which:
//
//   1. Detects the PM that installed the running sh1pt (same logic as
//      `sh1pt update` — pnpm/bun/aube/npm/deno based on install path).
//   2. Filters out anything already present in the PM's global
//      node_modules (no-op fast path).
//   3. Spawns the install with stdio: 'inherit' so the user sees the
//      native PM output. No prompt — just "installing X, Y…" and let
//      the PM stream its progress.
//
// Loading is a separate concern. Node's module resolution walks
// `<ancestor>/node_modules/<pkg>` from the file's directory. For
// globally-installed sh1pt, the global node_modules IS the dir at the
// top of that walk, so siblings under the same flat global aren't
// reachable via plain `import('@scope/pkg')`. We side-step that by
// reading the package's package.json from the global dir, resolving
// its ESM/CJS entry, and dynamic-importing via file URL.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import kleur from 'kleur';

export type PM = 'pnpm' | 'bun' | 'aube' | 'npm' | 'deno';

export function detectPackageManager(): PM {
  // The installed sh1pt's path tells us which PM put it there. Globals
  // each live in PM-specific dirs.
  const self = fileURLToPath(import.meta.url);
  if (/[/\\](\.pnpm|pnpm[/\\]global)[/\\]/.test(self)) return 'pnpm';
  if (/[/\\]\.bun[/\\]install[/\\]/.test(self)) return 'bun';
  if (/[/\\](\.aube|aube[/\\]global)[/\\]/.test(self)) return 'aube';
  if (/[/\\]\.deno[/\\]/.test(self)) return 'deno';
  // Not in a recognizable global tree — fall back to whichever PM is on
  // PATH. Order matches the install priority used by the bundled
  // install.sh (bun → pnpm → aube → npm → deno).
  for (const pm of ['bun', 'pnpm', 'aube', 'npm'] as const) {
    const r = spawnSync(pm, ['--version'], { stdio: 'ignore' });
    if (r.status === 0) return pm;
  }
  return 'npm';
}

// Where the PM keeps globally-installed packages. Returns null if we
// can't determine the path (e.g. deno; or a PM we couldn't probe).
export function globalNodeModulesDir(pm: PM): string | null {
  const home = process.env.HOME ?? '~';
  try {
    switch (pm) {
      case 'pnpm': {
        const r = spawnSync('pnpm', ['root', '-g'], { encoding: 'utf8' });
        return r.status === 0 ? (r.stdout ?? '').trim() || null : null;
      }
      case 'npm': {
        const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
        return r.status === 0 ? (r.stdout ?? '').trim() || null : null;
      }
      case 'bun':  return join(home, '.bun/install/global/node_modules');
      case 'aube': return join(home, '.aube/install/global/node_modules');
      case 'deno': return null;
    }
  } catch {
    return null;
  }
}

function installArgv(pm: PM, pkgs: string[]): string[] {
  switch (pm) {
    case 'pnpm': return ['pnpm', 'add', '-g', ...pkgs];
    case 'bun':  return ['bun',  'add', '-g', ...pkgs];
    case 'aube': return ['aube', 'add', '-g', ...pkgs];
    case 'npm':  return ['npm',  'install', '-g', ...pkgs];
    case 'deno': throw new Error('deno doesn\'t support per-package global installs the way npm/bun/pnpm do');
  }
}

// Install any of `pkgs` not already on disk. Streams the PM's native
// output. Returns the list of packages that were actually installed
// (empty if everything was already present).
export async function ensureInstalled(pkgs: string[]): Promise<string[]> {
  if (pkgs.length === 0) return [];
  const pm = detectPackageManager();
  const dir = globalNodeModulesDir(pm);
  const missing = dir
    ? pkgs.filter((p) => !existsSync(join(dir, ...p.split('/'), 'package.json')))
    : pkgs;
  if (missing.length === 0) return [];

  console.log(kleur.cyan(`installing dependencies: ${missing.join(', ')}…`));
  const argv = installArgv(pm, missing);
  const r = spawnSync(argv[0]!, argv.slice(1), { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`install failed (${pm} exited ${r.status ?? 'null'})`);
  }
  return missing;
}

// Resolve a package's ESM-or-CJS entry, then dynamic-import from the
// global node_modules dir. Falls back to plain `import(pkg)` first so
// monorepo / dev-mode imports keep working.
export async function loadInstalledPackage<T = unknown>(pkg: string): Promise<T | undefined> {
  // Plain import handles the dev / pnpm-workspace path where the
  // adapter is reachable through the normal node resolution chain.
  try {
    const mod = (await import(pkg)) as { default?: T } & T;
    return (mod.default ?? mod) as T;
  } catch {
    // fall through to the global lookup
  }

  const pm = detectPackageManager();
  const dir = globalNodeModulesDir(pm);
  if (!dir) return undefined;

  const pkgJsonPath = join(dir, ...pkg.split('/'), 'package.json');
  if (!existsSync(pkgJsonPath)) return undefined;
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const entry = resolveEntry(meta);
  if (!entry) return undefined;
  const full = join(dirname(pkgJsonPath), entry);
  try {
    const mod = (await import(pathToFileURL(full).href)) as { default?: T } & T;
    return (mod.default ?? mod) as T;
  } catch {
    return undefined;
  }
}

// Pick the right entrypoint for a package — prefer ESM, fall back to
// CJS. Handles the common shapes:
//   { exports: { ".": "./dist/index.js" } }
//   { exports: { ".": { import: "./dist/index.js", require: "./dist/index.cjs" } } }
//   { module: "./dist/index.mjs" }
//   { main: "./dist/index.js" }
function resolveEntry(meta: Record<string, unknown>): string | undefined {
  const exports_ = meta.exports as
    | string
    | Record<string, unknown>
    | undefined;
  if (typeof exports_ === 'string') return exports_;
  if (exports_ && typeof exports_ === 'object') {
    const root = (exports_['.'] ?? exports_) as
      | string
      | Record<string, unknown>;
    if (typeof root === 'string') return root;
    if (root && typeof root === 'object') {
      const importEntry = (root.import ?? root.default ?? root.require) as
        | string
        | Record<string, unknown>
        | undefined;
      if (typeof importEntry === 'string') return importEntry;
      if (importEntry && typeof importEntry === 'object') {
        const inner = (importEntry.default ?? importEntry.import ?? importEntry.require) as
          | string
          | undefined;
        if (typeof inner === 'string') return inner;
      }
    }
  }
  if (typeof meta.module === 'string') return meta.module;
  if (typeof meta.main === 'string') return meta.main;
  return 'index.js';
}
