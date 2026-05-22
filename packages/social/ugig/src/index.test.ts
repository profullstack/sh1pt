import { fakeConnectContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'social' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-ugig adapter', () => {
  it('connects through the current ugig profile endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ profile: { id: 'user-123', username: 'safe_earn_393559' } }),
    } as any);

    const ctx = fakeConnectContext({ UGIG_TOKEN: 'test-token' });
    const result = await adapter.connect(ctx as any, {});

    expect(result.accountId).toBe('safe_earn_393559');
    expect(fetch).toHaveBeenCalledWith(
      'https://ugig.net/api/profile',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });
});
