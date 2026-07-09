import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'tv', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Roku TV target', () => {
  async function writeValidRokuProject() {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-roku-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-roku-out-'));
    tempDirs.push(projectDir, outDir);
    await mkdir(join(projectDir, 'roku', 'components'), { recursive: true });
    await mkdir(join(projectDir, 'roku', 'images'), { recursive: true });
    await writeFile(join(projectDir, 'roku', 'components', 'MainScene.xml'), '<component />\n', 'utf-8');
    await writeFile(join(projectDir, 'roku', 'images', 'icon.png'), 'png', 'utf-8');
    await writeFile(join(projectDir, 'roku', 'manifest'), [
      'title=Acme Channel',
      'major_version=1',
      'minor_version=2',
      'build_version=3',
      'mm_icon_focus_hd=images/icon.png',
      '',
    ].join('\n'), 'utf-8');
    return { projectDir, outDir };
  }

  it('validates the Roku manifest and writes a package plan', async () => {
    const { projectDir, outDir } = await writeValidRokuProject();

    const result = await adapter.build(fakeBuildContext({
      projectDir,
      outDir,
      version: '1.2.3',
    }) as any, {
      developerId: 'dev-123',
      sourceDir: 'roku',
      channelType: 'beta',
      channelId: 'channel-456',
    });

    expect(result.artifact).toBe(join(outDir, 'roku-package-plan.json'));
    expect(result.meta).toEqual({
      expectedPackage: join(outDir, 'roku-channel.zip'),
      files: 3,
      command: ['zip', '-r', join(outDir, 'roku-channel.zip'), '.'],
    });

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      provider: 'roku',
      title: 'Acme Channel',
      version: '1.2.3',
      channelId: 'channel-456',
      developerId: 'dev-123',
      channelType: 'beta',
      sourceDir: join(projectDir, 'roku'),
      expectedPackage: join(outDir, 'roku-channel.zip'),
      command: ['zip', '-r', join(outDir, 'roku-channel.zip'), '.'],
      submission: 'beta channel',
    });
    expect(plan.files).toEqual([
      'components/MainScene.xml',
      'images/icon.png',
      'manifest',
    ]);
  });

  it('rejects unsupported channel types while building the package plan', async () => {
    const { projectDir, outDir } = await writeValidRokuProject();

    await expect(adapter.build(fakeBuildContext({
      projectDir,
      outDir,
    }) as any, {
      developerId: 'dev-123',
      sourceDir: 'roku',
      channelType: 'preview',
    } as any)).rejects.toThrow('tv-roku channelType must be one of: public, beta, private');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      developerId: 'dev-123',
      sourceDir: 'roku',
      channelType: 'public',
    })).resolves.toEqual({
      id: 'dry-run',
      meta: {
        channelType: 'public',
        destination: 'Roku Channel Store review',
      },
    });
  });

  it('rejects unsupported channel types while shipping', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      developerId: 'dev-123',
      sourceDir: 'roku',
      channelType: 'preview',
    } as any)).rejects.toThrow('tv-roku channelType must be one of: public, beta, private');
  });

  it('returns package metadata in real ship mode', async () => {
    await expect(adapter.ship(fakeShipContext({
      artifact: '/repo/.sh1pt/out/roku-package-plan.json',
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      developerId: 'dev-123',
      sourceDir: 'roku',
      channelType: 'private',
      channelId: 'channel-456',
    })).resolves.toEqual({
      id: 'channel-456@1.2.3',
      meta: {
        artifact: '/repo/.sh1pt/out/roku-package-plan.json',
        channelType: 'private',
        destination: 'private channel',
        developerId: 'dev-123',
      },
    });
  });

  it('requires a manifest title', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-roku-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-roku-out-'));
    tempDirs.push(projectDir, outDir);
    await mkdir(join(projectDir, 'roku'), { recursive: true });
    await writeFile(join(projectDir, 'roku', 'manifest'), [
      'major_version=1',
      'minor_version=2',
      '',
    ].join('\n'), 'utf-8');

    await expect(adapter.build(fakeBuildContext({
      projectDir,
      outDir,
    }) as any, {
      developerId: 'dev-123',
      sourceDir: 'roku',
      channelType: 'private',
    })).rejects.toThrow('tv-roku requires manifest title');
  });
});
