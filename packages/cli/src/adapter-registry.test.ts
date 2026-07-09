import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './adapter-registry.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const excludedPackageDirs = new Map<string, Set<string>>([
  ['bots', new Set(['core'])],
]);

function packageDirs(path: string): string[] {
  return readdirSync(path)
    .filter((name) => statSync(join(path, name)).isDirectory())
    .sort();
}

describe('adapter registry', () => {
  for (const category of CATEGORIES) {
    it(`lists every ${category.id} package directory`, () => {
      const excluded = excludedPackageDirs.get(category.id) ?? new Set<string>();
      const dirs = packageDirs(join(repoRoot, 'packages', category.id))
        .filter((name) => !excluded.has(name));

      expect(category.adapters.slice().sort()).toEqual(dirs);
    });
  }
});
