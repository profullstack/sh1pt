import { describe, it, expect } from 'vitest';

describe('secrets-env-updater', () => {
  it('should have the provider registered', async () => {
    const provider = await import('./index.js');
    expect(provider.default).toBeDefined();
    expect(provider.default.id).toBe('secrets-env-updater');
    expect(provider.default.label).toBe('Env Updater');
  });

  it('should define push/pull/connect methods', async () => {
    const provider = await import('./index.js');
    expect(typeof provider.default.connect).toBe('function');
    expect(typeof provider.default.pull).toBe('function');
    expect(typeof provider.default.push).toBe('function');
  });
});
