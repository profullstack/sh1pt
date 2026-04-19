import { describe, it, expect } from 'vitest';
import type { Bot, BotReply } from '../bot.js';

export interface BotContractOptions {
  sampleConfig: unknown;
  sampleChannel: string;
  sampleReply?: BotReply;
}

export function contractTestBot(b: Bot<any>, opts: BotContractOptions): void {
  describe(`Bot contract · ${b.id}`, () => {
    it('declares required fields', () => {
      expect(b.id).toMatch(/^bot-[a-z][a-z0-9-]*$/);
      expect(b.label).toBeTruthy();
      expect(Array.isArray(b.supports)).toBe(true);
      expect(b.supports.length).toBeGreaterThan(0);
    });

    it('register() dry-run returns a closer', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const handle = await b.register(ctx as any, [], opts.sampleConfig);
      expect(handle).toBeTruthy();
      expect(typeof handle.close).toBe('function');
      await handle.close();
    });

    it('send() dry-run returns an id', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const reply = opts.sampleReply ?? { text: 'hello from contract test' };
      const result = await b.send(ctx as any, opts.sampleChannel, reply, opts.sampleConfig);
      expect(result.id).toBeTruthy();
    });
  });
}
