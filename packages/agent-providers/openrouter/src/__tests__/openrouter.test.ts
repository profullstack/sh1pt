import { describe, it, expect } from 'vitest';
import { openrouterProvider } from '../provider';

describe('openrouter provider', () => {
  it('fails without API key', () => {
    expect(() => openrouterProvider.validateEnv({})).toThrow();
  });

  it('chat throws not implemented', async () => {
    await expect(openrouterProvider.chat({ messages: [] })).rejects.toThrow();
  });
});
