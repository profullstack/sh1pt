import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExperiment, loadExperiments, updateExperiment } from './iterate.js';

let tempDir = '';

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = '';
  }
  delete process.env.XDG_CONFIG_HOME;
});

function useTempConfig(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-iterate-test-'));
  process.env.XDG_CONFIG_HOME = tempDir;
}

describe('createExperiment', () => {
  it('builds an active experiment with defaults', () => {
    const experiment = createExperiment('pricing page copy improves signup', {}, new Date('2026-01-02T03:04:05Z'));

    expect(experiment.hypothesis).toBe('pricing page copy improves signup');
    expect(experiment.variants).toEqual(['current', 'candidate']);
    expect(experiment.traffic).toBe(50);
    expect(experiment.minSample).toBe(1000);
    expect(experiment.status).toBe('active');
    expect(experiment.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(experiment.updatedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(experiment.id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('keeps provided variants and thresholds', () => {
    const experiment = createExperiment('shorter onboarding wins', {
      variant: ['control', 'short-form'],
      traffic: 25,
      minSample: 250,
    });

    expect(experiment.variants).toEqual(['control', 'short-form']);
    expect(experiment.traffic).toBe(25);
    expect(experiment.minSample).toBe(250);
  });
});

describe('loadExperiments', () => {
  it('returns an empty state when no experiment file exists', async () => {
    useTempConfig();

    await expect(loadExperiments()).resolves.toEqual({ experiments: [] });
  });

  it('loads persisted active, paused, and ended experiments', async () => {
    useTempConfig();
    const configPath = join(tempDir, 'sh1pt');
    mkdirSync(configPath, { recursive: true });
    writeFileSync(join(configPath, 'iterate-experiments.json'), JSON.stringify({
      experiments: [
        {
          id: '12ab34cd',
          hypothesis: 'shorter onboarding wins',
          variants: ['A', 'B'],
          traffic: 25,
          minSample: 250,
          createdAt: '2026-01-02T03:04:05.000Z',
          updatedAt: '2026-01-02T04:04:05.000Z',
          status: 'paused',
        },
        {
          id: '89ef0123',
          hypothesis: 'new headline improves signup',
          variants: ['A', 'B'],
          traffic: 50,
          minSample: 1000,
          createdAt: '2026-01-02T03:04:05.000Z',
          updatedAt: '2026-01-02T05:04:05.000Z',
          status: 'ended',
          winner: 'B',
          note: 'signup rate improved',
        },
      ],
    }));

    const state = await loadExperiments();

    expect(state.experiments).toHaveLength(2);
    expect(state.experiments[0]?.status).toBe('paused');
    expect(state.experiments[1]?.winner).toBe('B');
    expect(state.experiments[1]?.note).toBe('signup rate improved');
  });
});

describe('updateExperiment', () => {
  it('pauses, resumes, and ends experiments with outcome metadata', () => {
    const state = {
      experiments: [
        createExperiment('shorter onboarding wins', {
          variant: ['A', 'B'],
          traffic: 25,
          minSample: 250,
        }, new Date('2026-01-02T03:04:05Z')),
      ],
    };
    const id = state.experiments[0]?.id ?? '';

    updateExperiment(state, id, 'paused', { now: new Date('2026-01-02T04:04:05Z') });
    expect(state.experiments[0]?.status).toBe('paused');
    expect(state.experiments[0]?.updatedAt).toBe('2026-01-02T04:04:05.000Z');

    updateExperiment(state, id, 'active', { now: new Date('2026-01-02T05:04:05Z') });
    expect(state.experiments[0]?.status).toBe('active');

    updateExperiment(state, id, 'ended', {
      winner: 'B',
      note: 'signup rate improved',
      now: new Date('2026-01-02T06:04:05Z'),
    });
    expect(state.experiments[0]?.status).toBe('ended');
    expect(state.experiments[0]?.winner).toBe('B');
    expect(state.experiments[0]?.note).toBe('signup rate improved');
    expect(state.experiments[0]?.updatedAt).toBe('2026-01-02T06:04:05.000Z');

    updateExperiment(state, id, 'active', { now: new Date('2026-01-02T07:04:05Z') });
    expect(state.experiments[0]?.status).toBe('active');
    expect(state.experiments[0]?.winner).toBeUndefined();
    expect(state.experiments[0]?.note).toBeUndefined();
  });
});
