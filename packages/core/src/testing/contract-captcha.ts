import { describe, it, expect } from 'vitest';
import type { CaptchaSolver } from '../captcha.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface CaptchaContractOptions {
  sampleConfig: unknown;
  requiredSecrets: string[];
}

export function contractTestCaptcha(c: CaptchaSolver<any>, opts: CaptchaContractOptions): void {
  describe(`CaptchaSolver contract · ${c.id}`, () => {
    it('declares required fields', () => {
      expect(c.id).toMatch(/^captcha-[a-z][a-z0-9-]*$/);
      expect(c.label).toBeTruthy();
      expect(c.supports.length).toBeGreaterThan(0);
    });

    it('connect() throws vault-hint when secrets are missing', async () => {
      const ctx = fakeConnectContext({});
      await expect(c.connect(ctx as any, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });
  });
}
