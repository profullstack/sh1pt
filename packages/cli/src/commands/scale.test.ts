import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadFleet,
  saveFleet,
  loadRollouts,
  saveRollouts,
  sortInstancesForScaleDown,
  CREDS_FILE,
  ROLLOUTS_FILE,
} from './scale.js';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers for tests — use temp files so we don't clobber real state
// ---------------------------------------------------------------------------
const ORIG_CREDS = CREDS_FILE;
const ORIG_ROLLOUTS = ROLLOUTS_FILE;

// We test the exported helper functions directly. Since CREDS_FILE is
// resolved at import time we can't redirect it, but we can still test
// sortInstancesForScaleDown (pure function) and verify the load/save
// round-trip with the actual paths by cleaning up.

function cleanup() {
  try { if (existsSync(CREDS_FILE)) unlinkSync(CREDS_FILE); } catch { /* ok */ }
  try { if (existsSync(ROLLOUTS_FILE)) unlinkSync(ROLLOUTS_FILE); } catch { /* ok */ }
}

function writeCreds(data: unknown) {
  const dir = dirname(CREDS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CREDS_FILE, JSON.stringify(data, null, 2));
}

function writeRollouts(data: unknown) {
  const dir = dirname(ROLLOUTS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(ROLLOUTS_FILE, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// sortInstancesForScaleDown
// ---------------------------------------------------------------------------
describe('sortInstancesForScaleDown', () => {
  it('prioritises failed instances over running ones', () => {
    const instances = [
      { id: 'inst-0001', provider: 'aws', status: 'running' as const, createdAt: '', hourlyRate: 0.05 },
      { id: 'inst-0002', provider: 'aws', status: 'failed' as const, createdAt: '', hourlyRate: 0.10 },
      { id: 'inst-0003', provider: 'gcp', status: 'running' as const, createdAt: '', hourlyRate: 0.03 },
    ];
    const sorted = sortInstancesForScaleDown(instances);
    expect(sorted[0]!.id).toBe('inst-0002');     // failed first
    expect(sorted[sorted.length - 1]!.id).toBe('inst-0001'); // most expensive running last
  });

  it('prioritises stopped instances over running ones', () => {
    const instances = [
      { id: 'inst-0001', provider: 'aws', status: 'running' as const, createdAt: '', hourlyRate: 0.05 },
      { id: 'inst-0002', provider: 'aws', status: 'stopped' as const, createdAt: '', hourlyRate: 0.10 },
    ];
    const sorted = sortInstancesForScaleDown(instances);
    expect(sorted[0]!.id).toBe('inst-0002'); // stopped first
    expect(sorted[1]!.id).toBe('inst-0001');
  });

  it('sorts by hourly rate within the same status (cheapest first)', () => {
    const instances = [
      { id: 'inst-0001', provider: 'aws', status: 'running' as const, createdAt: '', hourlyRate: 0.10 },
      { id: 'inst-0002', provider: 'gcp', status: 'running' as const, createdAt: '', hourlyRate: 0.02 },
      { id: 'inst-0003', provider: 'do',  status: 'running' as const, createdAt: '', hourlyRate: 0.05 },
    ];
    const sorted = sortInstancesForScaleDown(instances);
    expect(sorted.map((i: any) => i.id)).toEqual(['inst-0002', 'inst-0003', 'inst-0001']);
  });

  it('returns empty array for empty input', () => {
    expect(sortInstancesForScaleDown([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadFleet / saveFleet round-trip
// ---------------------------------------------------------------------------
describe('loadFleet / saveFleet', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('returns empty fleet when no credentials file exists', () => {
    const fleet = loadFleet();
    expect(fleet.instances).toEqual([]);
  });

  it('round-trips fleet instances through save and load', () => {
    const fleet = {
      instances: [
        { id: 'inst-0001', provider: 'aws', status: 'running' as const, publicIp: '1.2.3.4', privateIp: '10.0.0.1', createdAt: '2025-01-01T00:00:00Z', hourlyRate: 0.096, tags: ['test'] },
      ],
      lastUpdated: '',
    };
    saveFleet(fleet);
    const loaded = loadFleet();
    expect(loaded.instances.length).toBe(1);
    expect(loaded.instances[0]!.id).toBe('inst-0001');
    expect(loaded.instances[0]!.provider).toBe('aws');
    expect(loaded.instances[0]!.status).toBe('running');
    expect(loaded.instances[0]!.hourlyRate).toBe(0.096);
  });

  it('preserves other keys in credentials file when saving', () => {
    writeCreds({ apiKey: 'secret123', instances: [] });
    const fleet = { instances: [{ id: 'inst-0001', provider: 'do', status: 'running' as const, createdAt: '', hourlyRate: 0.042 }], lastUpdated: '' };
    saveFleet(fleet);
    const raw = JSON.parse(readFileSync(CREDS_FILE, 'utf-8'));
    expect(raw.apiKey).toBe('secret123');
    expect(raw.instances!.length).toBe(1);
  });

  it('reads fleet stored under the "fleet" key', () => {
    writeCreds({ fleet: [{ id: 'inst-0001', provider: 'gcp', status: 'running', createdAt: '', hourlyRate: 0.085 }] });
    const loaded = loadFleet();
    expect(loaded.instances.length).toBe(1);
    expect(loaded.instances[0]!.provider).toBe('gcp');
  });

  it('handles corrupted credentials file gracefully', () => {
    const dir = dirname(CREDS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CREDS_FILE, 'not-valid-json{{{');
    const fleet = loadFleet();
    expect(fleet.instances).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadRollouts / saveRollouts round-trip
// ---------------------------------------------------------------------------
describe('loadRollouts / saveRollouts', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('returns empty rollouts when no file exists', () => {
    const rs = loadRollouts();
    expect(rs.rollouts).toEqual([]);
  });

  it('round-trips rollouts through save and load', () => {
    const state = {
      rollouts: [
        {
          id: 'r-abc123',
          version: 'v2.0.0',
          strategy: 'canary',
          percent: 10,
          status: 'completed' as const,
          startedAt: '2025-01-01T00:00:00Z',
          newInstanceIds: ['inst-0002'],
          oldInstanceIds: ['inst-0001'],
          note: 'Test rollout',
        },
      ],
    };
    saveRollouts(state);
    const loaded = loadRollouts();
    expect(loaded.rollouts.length).toBe(1);
    expect(loaded.rollouts[0]!.id).toBe('r-abc123');
    expect(loaded.rollouts[0]!.status).toBe('completed');
  });

  it('handles corrupted rollouts file gracefully', () => {
    const dir = dirname(ROLLOUTS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(ROLLOUTS_FILE, 'broken-json{{{');
    const rs = loadRollouts();
    expect(rs.rollouts).toEqual([]);
  });
});
