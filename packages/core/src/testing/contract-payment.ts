import { describe, it, expect } from 'vitest';
import type { PaymentProvider } from '../payments.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface PaymentContractOptions {
  sampleConfig: unknown;
  requiredSecrets: string[];
  supportsCheckout?: boolean;          // set false for payout-only providers (WorldRemit, Wise)
}

export function contractTestPayment(p: PaymentProvider<any>, opts: PaymentContractOptions): void {
  describe(`PaymentProvider contract · ${p.id}`, () => {
    it('declares required fields', () => {
      expect(p.id).toMatch(/^payment-[a-z][a-z0-9-]*$/);
      expect(p.label).toBeTruthy();
    });

    it('connect() throws vault-hint when secrets are missing', async () => {
      const ctx = fakeConnectContext({});
      await expect(p.connect(ctx as any, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });

    if (opts.supportsCheckout !== false) {
      it('createCheckout() returns a URL', async () => {
        const ctx = fakeConnectContext(Object.fromEntries(opts.requiredSecrets.map((k) => [k, 'test'])));
        const session = await p.createCheckout(ctx as any, {
          amount: 2440,
          currency: 'USD',
          kind: 'one-time',
          successUrl: 'https://example.com/ok',
          cancelUrl: 'https://example.com/cancel',
        }, opts.sampleConfig);
        expect(session.id).toBeTruthy();
        expect(session.url).toMatch(/^https?:\/\//);
      });
    }

    it('verifyWebhook() parses valid JSON bodies without throwing', async () => {
      const webhook = await p.verifyWebhook(
        fakeConnectContext({}) as any,
        JSON.stringify({ type: 'test.event', id: 'evt_1' }),
        'sig-stub',
        opts.sampleConfig,
      );
      expect(webhook.type).toBeTruthy();
    });
  });
}
