/**
 * Registry regression tests — ensure the CATEGORIES list in adapter-registry.ts
 * stays aligned with the packages/<category>/ filesystem layout.
 *
 * Closes #219.
 *
 * Run: pnpm exec vitest run packages/cli/src/adapter-registry.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CATEGORIES } from './adapter-registry.js';

// Resolve monorepo root relative to this file (packages/cli/src → ../../..)
const MONOREPO_ROOT = resolve(new URL(import.meta.url).pathname, '../../..');

/**
 * Read the immediate sub-directories of packages/<category>/
 * Returns an empty array if the directory doesn't exist (graceful for CI
 * environments where a category may not have been populated yet).
 */
function listPackageDirs(categoryId: string): string[] {
  const dir = join(MONOREPO_ROOT, 'packages', categoryId);
  try {
    return readdirSync(dir).filter((name) => {
      try {
        return statSync(join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

describe('adapter-registry CATEGORIES', () => {
  it('has no duplicate adapter names within any category', () => {
    for (const cat of CATEGORIES) {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const a of cat.adapters) {
        if (seen.has(a)) dupes.push(a);
        seen.add(a);
      }
      expect(dupes, `category "${cat.id}" has duplicate adapters: ${dupes.join(', ')}`).toHaveLength(0);
    }
  });

  it('has no duplicate category ids', () => {
    const ids = CATEGORIES.map((c) => c.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it('targets registry contains all directories under packages/targets/', () => {
    const targetsCat = CATEGORIES.find((c) => c.id === 'targets');
    expect(targetsCat, 'targets category must exist in CATEGORIES').toBeDefined();

    const fsDirs = listPackageDirs('targets');
    if (fsDirs.length === 0) {
      // Running in a shallow CI checkout — skip FS check but still pass.
      return;
    }

    const registeredSet = new Set(targetsCat!.adapters);
    const missing = fsDirs.filter((d) => !registeredSet.has(d));

    expect(
      missing,
      `packages/targets/ has directories not in CATEGORIES.targets.adapters: ${missing.join(', ')}\n` +
      'Update adapter-registry.ts to add them.',
    ).toHaveLength(0);
  });

  it('targets registry has no adapters that no longer exist on disk', () => {
    const targetsCat = CATEGORIES.find((c) => c.id === 'targets');
    expect(targetsCat).toBeDefined();

    const fsDirs = new Set(listPackageDirs('targets'));
    if (fsDirs.size === 0) return; // shallow clone — skip

    const phantom = targetsCat!.adapters.filter((a) => !fsDirs.has(a));
    expect(
      phantom,
      `CATEGORIES.targets.adapters references packages that do not exist on disk: ${phantom.join(', ')}\n` +
      'Remove them from adapter-registry.ts or add the missing packages.',
    ).toHaveLength(0);
  });

  it('every category has a non-empty pkgPrefix and description', () => {
    for (const cat of CATEGORIES) {
      expect(cat.pkgPrefix, `category "${cat.id}" must have pkgPrefix`).toBeTruthy();
      expect(cat.description, `category "${cat.id}" must have description`).toBeTruthy();
    }
  });

  it('every category has at least one adapter', () => {
    for (const cat of CATEGORIES) {
      expect(cat.adapters.length, `category "${cat.id}" must list at least one adapter`).toBeGreaterThan(0);
    }
  });
});
