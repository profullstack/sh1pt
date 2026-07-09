import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalog, loadCatalogEntry } from './catalog.js';

const SAMPLE_MANIFEST = `schemaVersion: 1
id: sample-ci
name: Sample CI
description: A sample pack
version: 1.0.0
publisher: sh1pt-tests
visibility: public
license: MIT
categories: [ci]
compatibility:
  providers: [github]
pricing:
  type: free
files:
  - source: workflows/ci.yml.hbs
    destination: .github/workflows/ci.yml
    mergeStrategy: replace-managed
policies:
  installMode: pull-request
  managedComment: true
  requiresReview: true
security:
  leastPrivilegePermissions: true
  pinThirdPartyActions: optional
  allowPullRequestTarget: false
  defaultTimeoutMinutes: 15
`;

async function makeFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sh1pt-catalog-'));
  const packDir = join(root, 'sample-ci');
  await mkdir(join(packDir, 'workflows'), { recursive: true });
  await writeFile(join(packDir, 'sh1pt.actionpack.yaml'), SAMPLE_MANIFEST, 'utf8');
  await writeFile(join(packDir, 'workflows', 'ci.yml.hbs'), 'name: CI\n', 'utf8');
  return root;
}

describe('loadCatalog', () => {
  it('loads packs from a directory', async () => {
    const root = await makeFixture();
    try {
      const catalog = await loadCatalog(root);
      expect(catalog.size).toBe(1);
      const entry = catalog.get('sample-ci');
      expect(entry?.manifest.name).toBe('Sample CI');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns empty map for missing root', async () => {
    const catalog = await loadCatalog('/nonexistent/path/here');
    expect(catalog.size).toBe(0);
  });

  it('skips dirs without a manifest', async () => {
    const root = await makeFixture();
    try {
      await mkdir(join(root, 'not-a-pack'));
      await writeFile(join(root, 'not-a-pack', 'README.md'), 'hi', 'utf8');
      const catalog = await loadCatalog(root);
      expect(catalog.size).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('loadCatalogEntry', () => {
  it('loads a single pack', async () => {
    const root = await makeFixture();
    try {
      const entry = await loadCatalogEntry(join(root, 'sample-ci'));
      expect(entry.manifest.id).toBe('sample-ci');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
