import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('dnf / RPM spec generation', () => {
  it('writes an RPM spec and a self-hosted .repo file', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-dnf-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir, version: 'v1.5.0-rc1' }) as any, {
      packageName: 'myapp',
      summary: 'My App',
      license: 'Apache-2.0',
      url: 'https://example.com/myapp',
      requires: ['glibc', 'openssl'],
    });

    const specPath = join(outDir, 'rpm', 'myapp.spec');
    expect(result.artifact).toBe(specPath);

    const spec = await readFile(specPath, 'utf-8');
    expect(spec).toContain('Name:           myapp');
    // 'v' stripped and '-' replaced so the RPM version is valid.
    expect(spec).toContain('Version:        1.5.0.rc1');
    expect(spec).toContain('Release:        1%{?dist}');
    expect(spec).toContain('License:        Apache-2.0');
    expect(spec).toContain('Requires:       glibc');
    expect(spec).toContain('Requires:       openssl');
    expect(spec).toContain('%description');
    expect(spec).toContain('%changelog');
    // %changelog header must be valid RPM form: "* Wed May 29 2026 Name <email> - ver-rel"
    expect(spec).toMatch(/^\* (Sun|Mon|Tue|Wed|Thu|Fri|Sat) [A-Z][a-z]{2} \d{2} \d{4} sh1pt <release@sh1pt\.com> - .+-.+$/m);

    const repo = await readFile(join(outDir, 'rpm', 'myapp.repo'), 'utf-8');
    expect(repo).toContain('[myapp]');
    expect(repo).toContain('gpgcheck=1');
    expect(repo).toContain('dnf.sh1pt.com');
  });

  it('targets Fedora COPR when coprProject is set', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-dnf-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir, version: '2.0.0' }) as any, {
      packageName: 'myapp',
      coprProject: 'acme/myapp',
    });

    const repo = await readFile(join(outDir, 'rpm', 'myapp.repo'), 'utf-8');
    expect(repo).toContain('download.copr.fedorainfracloud.org/results/acme/myapp');
    // gpgkey must point at the COPR project's pubkey, not the self-hosted fallback.
    expect(repo).toContain('gpgkey=https://download.copr.fedorainfracloud.org/results/acme/myapp/pubkey.gpg');

    // COPR publish path uses copr-cli with the documented `status <buildId>` form.
    expect(result.meta?.commands).toContain('copr-cli status <buildId>');
    expect((result.meta?.commands as string[])?.some((c: string) => c.startsWith('copr-cli build acme/myapp'))).toBe(true);
  });

  it('keeps dry-run shipping side-effect free and surfaces build commands', async () => {
    const ship = await adapter.ship(fakeShipContext({ version: '1.5.0', dryRun: true }) as any, {
      packageName: 'myapp',
    });
    expect(ship.id).toBe('dry-run');
    expect((ship.meta?.commands as string[])?.some((c: string) => c.startsWith('rpmbuild'))).toBe(true);

    await expect(adapter.ship(fakeShipContext({ version: '1.5.0', dryRun: false }) as any, {
      packageName: 'myapp',
    })).rejects.toThrow(/not implemented/i);
  });
});
