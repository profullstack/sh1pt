import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'secrets' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Railway secrets provider', () => {
  it('redacts secret values from Railway CLI failure messages', async () => {
    execMock.mockRejectedValue(new Error('railway variable set API_TOKEN=super-secret failed (exit 1): invalid value'));

    let thrown: unknown;
    try {
      await adapter.push({ secret: () => undefined, log: () => {} }, [
        { key: 'API_TOKEN', value: 'super-secret' },
      ], {});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('API_TOKEN=<redacted>');
    expect((thrown as Error).message).not.toContain('super-secret');
  });
});
