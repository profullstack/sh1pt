import { describe, it, expect } from 'vitest';
import type { AgentCLI } from '../agent.js';

export interface AgentContractOptions {
  sampleConfig: unknown;
}

export function contractTestAgent(a: AgentCLI<any>, opts: AgentContractOptions): void {
  describe(`AgentCLI contract · ${a.id}`, () => {
    it('declares required fields', () => {
      expect(a.id).toMatch(/^agent-[a-z][a-z0-9-]*$/);
      expect(a.label).toBeTruthy();
      expect(a.binary).toBeTruthy();
      expect(Array.isArray(a.capabilities)).toBe(true);
    });

    it('check() returns an install-state shape', async () => {
      const state = await a.check({ log: () => {} }, opts.sampleConfig);
      expect(typeof state.installed).toBe('boolean');
      expect(typeof state.authenticated).toBe('boolean');
      expect(typeof state.installHint).toBe('string');
      expect(state.installHint).toContain('install');
    });
  });
}
