import { describe, it, expect } from 'vitest';
import type { Target } from '../target.js';
import { fakeBuildContext, fakeShipContext } from './harness.js';

export interface TargetContractOptions {
  sampleConfig: unknown;
}

export function contractTestTarget(target: Target<any>, opts: TargetContractOptions): void {
  describe(`Target contract · ${target.id}`, () => {
    it('declares required fields', () => {
      expect(target.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(target.label).toBeTruthy();
      expect(target.kind).toBeTruthy();
    });

    it('build() in dry-run returns a BuildResult with an artifact string', async () => {
      const ctx = fakeBuildContext();
      const result = await target.build(ctx as any, opts.sampleConfig);
      expect(typeof result.artifact).toBe('string');
    });

    it('ship() in dry-run returns a ShipResult with an id', async () => {
      const ctx = fakeShipContext();
      const result = await target.ship(ctx as any, opts.sampleConfig);
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
    });

    it('ship() dry-run never requires secrets', async () => {
      const ctx = fakeShipContext();
      await expect(target.ship(ctx as any, opts.sampleConfig)).resolves.toBeDefined();
    });

    const statusFn = target.status;
    if (statusFn) {
      it('status() returns a valid state', async () => {
        const status = await statusFn('stub-id', opts.sampleConfig);
        expect(['pending', 'building', 'shipping', 'in-review', 'live', 'failed', 'rolled-back']).toContain(status.state);
      });
    }
  });
}
