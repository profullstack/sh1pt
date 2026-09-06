#!/usr/bin/env node
// Lockstep-bump every published sh1pt package:
//   @profullstack/sh1pt-core, sh1pt-openapi, sh1pt-actions-fleet-core,
//   sh1pt-action-packs, sh1pt-secrets-env-updater, sh1pt-policy,
//   sh1pt-automation-browser, sh1pt (the cli)
//
// The cli depends on all of the others, and pnpm rewrites `workspace:` to a
// real range at publish time. Anything the cli depends on therefore has to be
// published too, at a version that exists — so this list and the publish steps
// in .github/workflows/release.yml have to stay in step with each other.
//
// Usage:
//   node scripts/version.mjs patch   (0.1.1 → 0.1.2)
//   node scripts/version.mjs minor   (0.1.1 → 0.2.0)
//   node scripts/version.mjs major   (0.1.1 → 1.0.0)
//   node scripts/version.mjs 0.3.4   (explicit)
//
// Keeps all three at the exact same version so consumers never have to
// wonder which cli pairs with which core. Picks the max current version
// across the three as the base, then applies the bump.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
// Dependency order: dependencies before the packages that consume them.
const PACKAGES = [
  'packages/core',
  'packages/openapi',
  'packages/actions-fleet-core',
  'packages/actions',
  'packages/secrets/env-updater',
  'packages/policy',
  'packages/automation/browser',
  'packages/cli',
];
const arg = process.argv[2] ?? 'patch';

function cmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

const entries = PACKAGES.map((rel) => {
  const path = resolve(ROOT, rel, 'package.json');
  return { path, json: JSON.parse(readFileSync(path, 'utf8')) };
});

const current = entries.reduce((max, e) => (cmp(e.json.version, max) > 0 ? e.json.version : max), '0.0.0');

let next;
if (/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(arg)) {
  next = arg;
} else {
  const [maj, min, pat] = current.split('.').map(Number);
  if (arg === 'major') next = `${maj + 1}.0.0`;
  else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
  else if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
  else {
    console.error(`usage: version.mjs <patch|minor|major|x.y.z>`);
    process.exit(1);
  }
}

for (const { path, json } of entries) {
  const before = json.version;
  json.version = next;
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ${json.name.padEnd(30)} ${before.padStart(7)} → ${next}`);
}

console.log('');
console.log(`Next steps:`);
console.log(`  pnpm install --lockfile-only`);
console.log(`  git commit -am "sh1pt: release v${next}"`);
console.log(`  git tag v${next} && git push && git push --tags`);
