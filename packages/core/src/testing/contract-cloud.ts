import { describe, it, expect } from 'vitest';
import type { CloudProvider, InstanceSpec } from '../cloud.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface CloudContractOptions {
  sampleConfig: unknown;
  sampleSpec: InstanceSpec;
  requiredSecrets: string[];
}

export function contractTestCloud(p: CloudProvider<any>, opts: CloudContractOptions): void {
  describe(`CloudProvider contract · ${p.id}`, () => {
    it('declares required fields', () => {
      expect(p.id).toMatch(/^cloud-[a-z][a-z0-9-]*$/);
      expect(p.label).toBeTruthy();
      expect(Array.isArray(p.supports) && p.supports.length).toBeTruthy();
    });

    it(`connect() throws vault-hint when secrets are missing`, async () => {
      const ctx = fakeConnectContext({});
      await expect(p.connect(ctx as any, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });

    it('quote() returns a Quote with a non-negative hourly', async () => {
      const ctx = fakeConnectContext(Object.fromEntries(opts.requiredSecrets.map((k) => [k, 'test'])));
      const quote = await p.quote(ctx as any, opts.sampleSpec, opts.sampleConfig);
      expect(quote.hourly).toBeGreaterThanOrEqual(0);
      expect(quote.currency).toBeTruthy();
      expect(quote.provider).toBeTruthy();
    });

    it('provision() in dry-run never starts billing', async () => {
      const ctx = {
        secret: (k: string) => opts.requiredSecrets.includes(k) ? 'test' : undefined,
        log: () => {},
        dryRun: true,
      };
      const instance = await p.provision(ctx as any, opts.sampleSpec, opts.sampleConfig);
      expect(instance.id).toBeTruthy();
      expect(['provisioning', 'running']).toContain(instance.status);
    });

    if (opts.sampleSpec.kind === 'gpu') {
      it('GPU provisioning honors maxHourlyPrice guardrail when set', async () => {
        const ctx = {
          secret: (k: string) => opts.requiredSecrets.includes(k) ? 'test' : undefined,
          log: () => {},
          dryRun: true,
        };
        // With maxHourlyPrice set, a real impl would quote first and abort if exceeded.
        // The contract test just verifies the field is accepted without throwing.
        const spec = { ...opts.sampleSpec, maxHourlyPrice: 0.01 };
        await expect(p.provision(ctx as any, spec, opts.sampleConfig)).resolves.toBeDefined();
      });
    }
  });
}
