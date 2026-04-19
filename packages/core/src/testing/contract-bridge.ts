import { describe, it, expect } from 'vitest';
import type { BridgeNetwork } from '../bridge.js';

export interface BridgeContractOptions {
  sampleConfig: unknown;
  sampleChannel: string;
}

export function contractTestBridge(b: BridgeNetwork<any>, opts: BridgeContractOptions): void {
  describe(`BridgeNetwork contract · ${b.id}`, () => {
    it('declares required fields', () => {
      expect(b.id).toMatch(/^bridge-[a-z][a-z0-9-]*$/);
      expect(b.label).toBeTruthy();
    });

    it('send() dry-run returns an id without hitting the network', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const res = await b.send(ctx as any, opts.sampleChannel, {
        id: 'src-1',
        channel: 'src-channel',
        identity: { network: 'other', username: 'tester' },
        text: 'hello from contract test',
        timestamp: new Date().toISOString(),
      }, opts.sampleConfig);
      expect(res.id).toBeTruthy();
    });
  });
}
