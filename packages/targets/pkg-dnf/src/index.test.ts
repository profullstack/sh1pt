import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('RPM spec generation', () => {
  it('writes a .spec file from config', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-dnf-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir, version: 'v1.5.0' }) as any, {
      packageName: 'myapp',
      summary: 'An example CLI tool',
      description: 'An example CLI tool for doing things',
      license: 'MIT',
      homepage: 'https://example.com',
      architecture: 'x86_64',
      coprProject: 'acme/myapp',
      releaseRepo: 'acme/myapp',
      requires: ['glibc'],
    });

    expect(result.artifact).toBe(join(outDir, 'myapp.spec'));

    const spec = await readFile(join(outDir, 'myapp.spec'), 'utf-8');
    expect(spec).toContain('Name:           myapp');
    expect(spec).toContain('Version:        1.5.0');
    expect(spec).toContain('Summary:        An example CLI tool');
    expect(spec).toContain('License:        MIT');
    expect(spec).toContain('URL:            https://example.com');
    expect(spec).toContain('BuildArch:      x86_64');
    expect(spec).toContain('Requires:       glibc');
    expect(spec).toContain('%description');
    expect(spec).toContain('%files');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({ version: '1.5.0', dryRun: true }) as any, {
      packageName: 'myapp',
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
