import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { planBuildFrom } from './build-planner.js';
import { resolveInput } from './input.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('planBuildFrom', () => {
  it('infers targets from local project manifests without running scripts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sh1pt-plan-'));
    tempDirs.push(root);
    await writeFile(join(root, 'package.json'), JSON.stringify({
      scripts: {
        build: 'vite build',
      },
      dependencies: {
        expo: '^54.0.0',
        electron: '^39.0.0',
      },
      devDependencies: {
        '@vscode/vsce': '^3.0.0',
      },
    }), 'utf-8');
    await writeFile(join(root, 'Dockerfile'), 'FROM node:22\n', 'utf-8');
    await writeFile(join(root, 'vercel.json'), '{}\n', 'utf-8');

    const plan = planBuildFrom(resolveInput(root));

    expect(plan.mode).toBe('offline');
    expect(plan.targets).toEqual([
      'deploy-vercel',
      'desktop-linux',
      'desktop-mac',
      'desktop-win',
      'mobile-expo',
      'pkg-docker',
      'pkg-npm',
      'plugin-vscode',
      'web-static',
    ]);
    expect(plan.evidence).toEqual(expect.arrayContaining(['package.json', 'Dockerfile/docker-compose', 'vercel.json']));
  });

  it('classifies remote inputs without fetching them', () => {
    const plan = planBuildFrom(resolveInput('https://github.com/profullstack/sh1pt'));

    expect(plan.targets).toEqual([]);
    expect(plan.evidence).toEqual(['remote inputs are classified only; no network access was performed']);
    expect(plan.nextSteps[0]).toContain('Clone the repository locally');
  });

  it('infers targets from manifest documents when present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sh1pt-plan-'));
    tempDirs.push(root);
    const manifest = join(root, 'sh1pt.yml');
    await writeFile(manifest, 'targets:\n  - deploy-vercel\n  - mobile-expo\n  - pkg-docker\n', 'utf-8');

    const plan = planBuildFrom(resolveInput(manifest));

    expect(plan.targets).toEqual(['deploy-vercel', 'mobile-expo', 'pkg-docker']);
    expect(plan.evidence).toEqual([`manifest document: ${manifest}`]);
  });

  it('reports missing paths without probing anything else', () => {
    const plan = planBuildFrom(resolveInput('/tmp/sh1pt-missing-project-never'));

    expect(plan.targets).toEqual([]);
    expect(plan.evidence).toEqual(['local path does not exist']);
  });

  it('infers Expo config even without package dependencies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sh1pt-plan-'));
    tempDirs.push(root);
    await mkdir(join(root, 'apps'), { recursive: true });
    await writeFile(join(root, 'app.config.ts'), 'export default {};\n', 'utf-8');

    const plan = planBuildFrom(resolveInput(root));

    expect(plan.targets).toContain('mobile-expo');
    expect(plan.evidence).toContain('Expo app/eas config');
  });
});
