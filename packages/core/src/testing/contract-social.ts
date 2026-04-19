import { describe, it, expect } from 'vitest';
import type { SocialPlatform, SocialPost } from '../social.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface SocialContractOptions {
  sampleConfig: unknown;
  samplePost: SocialPost;
  requiredSecrets: string[];
}

export function contractTestSocial(p: SocialPlatform<any>, opts: SocialContractOptions): void {
  describe(`SocialPlatform contract · ${p.id}`, () => {
    it('declares required fields', () => {
      expect(p.id).toMatch(/^social-[a-z0-9][a-z0-9-]*$/);
      expect(p.label).toBeTruthy();
      expect(p.requires).toBeDefined();
    });

    it('connect() throws vault-hint when secrets are missing', async () => {
      const ctx = fakeConnectContext({});
      await expect(p.connect(ctx as any, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });

    it('post() in dry-run returns a PostResult', async () => {
      const ctx = {
        secret: (k: string) => opts.requiredSecrets.includes(k) ? 'test' : undefined,
        log: () => {},
        dryRun: true,
      };
      const result = await p.post(ctx as any, opts.samplePost, opts.sampleConfig);
      expect(result.id).toBeTruthy();
      expect(result.platform).toBeTruthy();
      expect(result.publishedAt).toBeTruthy();
    });

    if (p.requires.media?.length) {
      it(`rejects posts without required media: ${p.requires.media.join(' or ')}`, async () => {
        const ctx = {
          secret: (k: string) => opts.requiredSecrets.includes(k) ? 'test' : undefined,
          log: () => {},
          dryRun: true,
        };
        const noMedia = { ...opts.samplePost, media: [] };
        await expect(p.post(ctx as any, noMedia, opts.sampleConfig)).rejects.toThrow();
      });
    }
  });
}
