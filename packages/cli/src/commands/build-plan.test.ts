import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { resolveInput } from '../input.js';
import { createBuildPlan, formatBuildPlan } from './build-plan.js';

describe('createBuildPlan', () => {
  it('infers web, npm, docker, and Vercel targets from a local app', () => {
    const dir = tempProject();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      scripts: { build: 'vite build' },
      dependencies: { vite: '^5.0.0', react: '^18.0.0' },
    }));
    writeFileSync(join(dir, 'Dockerfile'), 'FROM node:22-alpine\n');
    writeFileSync(join(dir, 'vercel.json'), '{}\n');

    const plan = createBuildPlan(resolveInput(dir));
    const ids = plan.targets.map((target) => target.id);

    expect(ids).toContain('pkg-npm');
    expect(ids).toContain('web-static');
    expect(ids).toContain('pkg-docker');
    expect(ids).toContain('deploy-vercel');
    expect(plan.warnings).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects Expo projects from dependency and app config signals', () => {
    const dir = tempProject();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { expo: '^51.0.0' },
    }));
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { name: 'Demo' } }));

    const plan = createBuildPlan(resolveInput(dir));

    expect(plan.targets.some((target) => target.id === 'mobile-expo')).toBe(true);
    expect(plan.signals.some((signal) => signal.source === 'Expo app config')).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not fetch remote git inputs', () => {
    const plan = createBuildPlan(resolveInput('https://github.com/profullstack/sh1pt'));

    expect(plan.source.kind).toBe('git');
    expect(plan.targets).toEqual([]);
    expect(plan.warnings.join('\n')).toContain('not fetched');
    expect(formatBuildPlan(plan).join('\n')).toContain('next steps:');
  });
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sh1pt-build-plan-'));
  mkdirSync(dir, { recursive: true });
  return dir;
}
