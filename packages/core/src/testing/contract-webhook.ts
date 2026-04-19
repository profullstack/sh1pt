import { describe, it, expect } from 'vitest';
import type { WebhookTarget } from '../webhook.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface WebhookContractOptions {
  sampleConfig: unknown;
  requiredSecrets: string[];           // the URL-holding secrets
}

export function contractTestWebhook(t: WebhookTarget<any>, opts: WebhookContractOptions): void {
  describe(`WebhookTarget contract · ${t.id}`, () => {
    it('declares required fields', () => {
      expect(t.id).toMatch(/^webhook-[a-z][a-z0-9-]*$/);
      expect(t.label).toBeTruthy();
    });

    it('send() throws vault-hint when the URL secret is missing', async () => {
      const ctx = { ...fakeConnectContext({}), dryRun: false };
      await expect(t.send(ctx as any, {
        event: 'ship.published',
        timestamp: new Date().toISOString(),
        data: {},
      }, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });

    it('send() dry-run returns ok without calling the network', async () => {
      const ctx = {
        secret: (k: string) => opts.requiredSecrets.includes(k) ? 'https://example.com/hook' : undefined,
        log: () => {},
        dryRun: true,
      };
      const result = await t.send(ctx as any, {
        event: 'ship.published',
        timestamp: new Date().toISOString(),
        data: { target: 'pkg-npm' },
      }, opts.sampleConfig);
      expect(result.ok).toBe(true);
    });

    if (t.format) {
      it('format() returns a non-empty object', () => {
        const formatted = t.format!({
          event: 'ship.published',
          timestamp: new Date().toISOString(),
          data: { target: 'pkg-npm' },
        }, opts.sampleConfig);
        expect(typeof formatted).toBe('object');
      });
    }
  });
}
