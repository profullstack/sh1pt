import { describe, it, expect } from 'vitest';
import type { AdPlatform } from '../promo.js';
import { fakeCampaignContext, fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface AdPlatformContractOptions {
  sampleConfig: unknown;
  requiredSecrets?: string[];        // if present, connect() must throw vault-hint when missing
}

export function contractTestAdPlatform(p: AdPlatform<any>, opts: AdPlatformContractOptions): void {
  describe(`AdPlatform contract · ${p.id}`, () => {
    it('declares required fields', () => {
      expect(p.id).toMatch(/^promo-[a-z][a-z0-9-]*$/);
      expect(p.label).toBeTruthy();
    });

    if (opts.requiredSecrets?.length) {
      it(`connect() throws vault-hint when secrets are missing: ${opts.requiredSecrets.join(', ')}`, async () => {
        const ctx = fakeConnectContext({});
        await expect(p.connect(ctx as any, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
          e instanceof Error && looksLikeVaultHint(e),
        );
      });
    }

    it('start() in dry-run returns a campaign id', async () => {
      const ctx = fakeCampaignContext();
      const result = await p.start(ctx as any, opts.sampleConfig);
      expect(typeof result.id).toBe('string');
    });

    it('status() shape is valid', async () => {
      const status = await p.status('stub-campaign', opts.sampleConfig);
      expect(['pending', 'active', 'paused', 'ended', 'failed', 'rejected']).toContain(status.state);
      expect(typeof status.spend).toBe('number');
    });
  });
}
