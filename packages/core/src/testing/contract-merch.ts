import { describe, it, expect } from 'vitest';
import type { MerchProvider, MerchProductSpec } from '../merch.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface MerchContractOptions {
  sampleConfig: unknown;
  sampleProduct: MerchProductSpec;
  requiredSecrets: string[];
}

export function contractTestMerch(p: MerchProvider<any>, opts: MerchContractOptions): void {
  describe(`MerchProvider contract · ${p.id}`, () => {
    it('declares required fields', () => {
      expect(p.id).toMatch(/^merch-[a-z][a-z0-9-]*$/);
      expect(p.label).toBeTruthy();
      expect(p.supports.length).toBeGreaterThan(0);
    });

    it('connect() throws vault-hint when secrets are missing', async () => {
      const ctx = fakeConnectContext({});
      await expect(p.connect(ctx as any, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });

    it('createProduct() in dry-run returns SKUs matching the spec', async () => {
      const ctx = { log: () => {}, dryRun: true };
      const skus = await p.createProduct(ctx as any, opts.sampleProduct, opts.sampleConfig);
      expect(Array.isArray(skus)).toBe(true);
      for (const s of skus) {
        expect(s.kind).toBe(opts.sampleProduct.kind);
        expect(typeof s.retailPrice).toBe('number');
      }
    });
  });
}
