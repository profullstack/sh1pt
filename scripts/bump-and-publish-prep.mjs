#!/usr/bin/env node
// One-shot publish-prep for all adapter packages. Idempotent.
//
// What it does:
//   1. Walks every non-private packages/**/package.json.
//   2. Sets version to TARGET_VERSION (passed as arg or via env).
//   3. Adds the same `files`/`publishConfig`/`license`/`repository`
//      block we use on core so the published tarball ships dist/
//      and consumers pick up dist/index.js + dist/index.d.ts at
//      install time, while local dev keeps importing from src/
//      via the workspace-local main field.
//
// Run:
//   node scripts/bump-and-publish-prep.mjs 0.1.10

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const target = process.argv[2] ?? process.env.TARGET_VERSION;
if (!target) {
  console.error('usage: bump-and-publish-prep.mjs <version>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// `git ls-files` keeps us out of node_modules and dist/.
const tracked = execFileSync('git', ['ls-files', 'packages/**/package.json'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

let touched = 0;
for (const rel of tracked) {
  const full = resolve(repoRoot, rel);
  const pkg = JSON.parse(readFileSync(full, 'utf8'));
  if (pkg.private) continue;

  pkg.version = target;
  if (!pkg.license) pkg.license = 'MIT';
  if (!pkg.repository) {
    pkg.repository = {
      type: 'git',
      url: 'git+https://github.com/profullstack/sh1pt.git',
      directory: relative(repoRoot, dirname(full)).replace(/\\/g, '/'),
    };
  }
  if (!pkg.homepage) pkg.homepage = 'https://sh1pt.com';
  if (!pkg.bugs) pkg.bugs = 'https://github.com/profullstack/sh1pt/issues';

  // Adapter packages had main: ./src/index.ts (workspace dev path).
  // Add publishConfig + files: ["dist"] so the published tarball
  // ships dist/ and consumers load compiled JS, while local imports
  // keep using src/.
  const isAdapter = pkg.main === './src/index.ts' || pkg.main === 'src/index.ts';
  if (isAdapter) {
    if (!pkg.files) pkg.files = ['dist'];
    if (!pkg.publishConfig) {
      pkg.publishConfig = {
        access: 'public',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js',
          },
        },
      };
    }
    pkg.scripts = { ...(pkg.scripts ?? {}), prepublishOnly: 'pnpm build' };
  }

  writeFileSync(full, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  touched++;
}

console.log(`updated ${touched} package.json files → ${target}`);
