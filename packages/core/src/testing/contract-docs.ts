import { describe, it, expect } from 'vitest';
import type { DocProvider, DocSpec } from '../docs.js';

export interface DocContractOptions {
  sampleConfig: unknown;
  sampleSpec: DocSpec;
}

export function contractTestDocs(d: DocProvider<any>, opts: DocContractOptions): void {
  describe(`DocProvider contract · ${d.id}`, () => {
    it('declares required fields', () => {
      expect(d.id).toMatch(/^docs-[a-z][a-z0-9-]*$/);
      expect(d.label).toBeTruthy();
      expect(d.supports.length).toBeGreaterThan(0);
    });

    it('supports includes the sample format', () => {
      expect(d.supports).toContain(opts.sampleSpec.format);
    });

    it('generate() dry-run returns a DocResult with format + id', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const result = await d.generate(ctx as any, opts.sampleSpec, opts.sampleConfig);
      expect(result.id).toBeTruthy();
      expect(result.format).toBe(opts.sampleSpec.format);
    });
  });
}
