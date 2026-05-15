import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { categoryById } from './adapter-registry.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function packageDirs(path: string): string[] {
  return readdirSync(path)
    .filter((name) => statSync(join(path, name)).isDirectory())
    .sort();
}

describe('adapter registry', () => {
  it('lists every target package directory', () => {
    const targets = categoryById('targets');

    expect(targets?.adapters.slice().sort()).toEqual(
      packageDirs(join(repoRoot, 'packages', 'targets'))
    );
  });
});
