import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from './build-project.js';
import { loadManifestFromProject } from './manifest-loader.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sh1pt-cli-build-'));
  tempDirs.push(dir);
  return dir;
}

describe('loadManifestFromProject', () => {
  it('loads a TypeScript sh1pt config with defineConfig', async () => {
    const projectDir = await tempProject();
    await writeFile(join(projectDir, 'sh1pt.config.ts'), `
      import { defineConfig } from '@profullstack/sh1pt-core';

      export default defineConfig({
        name: 'demo',
        version: '1.2.3',
        targets: {
          web: { use: 'web-static', config: { dir: './dist', provider: 'netlify' } },
        },
      });
    `);

    const loaded = await loadManifestFromProject(projectDir);

    expect(loaded.manifest.name).toBe('demo');
    expect(loaded.manifest.channels).toEqual(['stable', 'beta', 'canary']);
    expect(loaded.manifest.targets.web?.use).toBe('web-static');
  });
});

describe('buildProject', () => {
  it('runs selected target adapters from the local manifest', async () => {
    const projectDir = await tempProject();
    await writeFile(join(projectDir, 'sh1pt.config.ts'), `
      import { defineConfig } from '@profullstack/sh1pt-core';

      export default defineConfig({
        name: 'demo',
        version: '1.2.3',
        targets: {
          web: {
            use: 'web-static',
            config: { dir: './dist/web', provider: 'netlify' },
          },
          brew: {
            use: 'pkg-homebrew',
            config: {
              tap: 'acme/homebrew-tools',
              formulaName: 'demo',
              binaries: [
                {
                  platform: 'darwin-arm64',
                  url: 'https://downloads.example.com/demo-1.2.3-darwin-arm64.tar.gz',
                  sha256: '${'a'.repeat(64)}',
                },
              ],
            },
          },
        },
      });
    `);

    const results = await buildProject({
      projectDir,
      channel: 'beta',
      targets: ['brew'],
    });

    expect(results).toEqual([
      expect.objectContaining({
        targetId: 'brew',
        adapterId: 'pkg-homebrew',
      }),
    ]);

    const formula = await readFile(results[0]!.artifact, 'utf8');
    expect(formula).toContain('class Demo < Formula');
    expect(formula).toContain('version "1.2.3"');
  });

  it('rejects unknown target names with the available target list', async () => {
    const projectDir = await tempProject();
    await writeFile(join(projectDir, 'sh1pt.config.json'), JSON.stringify({
      name: 'demo',
      version: '1.2.3',
      targets: {
        web: { use: 'web-static', config: { dir: './dist', provider: 'netlify' } },
      },
    }));

    await expect(buildProject({
      projectDir,
      channel: 'stable',
      targets: ['missing'],
    })).rejects.toThrow('Available targets: web');
  });
});
