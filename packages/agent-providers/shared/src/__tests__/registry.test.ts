import { describe, it, expect } from 'vitest';
import { registerAgentProvider, getAgentProvider, listAgentProviders } from '../registry';
import type { AgentProviderAdapter } from '../types';

const mock: AgentProviderAdapter = {
  id: 'test',
  displayName: 'Test',
  capabilities: { chat: true },
  getRequiredEnv: () => [],
  validateEnv: () => {},
  listModels: async () => { throw new Error('no'); },
  chat: async () => ({ content: 'x' }),
  healthcheck: async () => ({ ok: true }),
};

describe('registry', () => {
  it('registers and retrieves provider', () => {
    registerAgentProvider(mock);
    const p = getAgentProvider('test');
    expect(p?.id).toBe('test');
  });

  it('lists providers', () => {
    const list = listAgentProviders();
    expect(list.length).toBeGreaterThan(0);
  });
});
