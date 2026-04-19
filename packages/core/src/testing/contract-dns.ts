import { describe, it, expect } from 'vitest';
import type { DnsProvider } from '../dns.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface DnsContractOptions {
  sampleConfig: unknown;
  requiredSecrets: string[];
}

export function contractTestDns(p: DnsProvider<any>, opts: DnsContractOptions): void {
  describe(`DnsProvider contract · ${p.id}`, () => {
    it('declares required fields', () => {
      expect(p.id).toMatch(/^dns-[a-z][a-z0-9-]*$/);
      expect(p.label).toBeTruthy();
    });

    it('connect() throws vault-hint when secrets are missing', async () => {
      const ctx = fakeConnectContext({});
      await expect(p.connect(ctx as any, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });

    it('syncRoundRobin returns DnsRecord[] shaped entries', async () => {
      const records = await p.syncRoundRobin(
        { zoneId: 'zone-1', name: 'api', ips: ['1.2.3.4', '5.6.7.8'], ttl: 60 },
        opts.sampleConfig,
      );
      expect(Array.isArray(records)).toBe(true);
      for (const r of records) {
        expect(r.type).toBe('A');
        expect(r.ttl).toBeGreaterThan(0);
      }
    });
  });
}
