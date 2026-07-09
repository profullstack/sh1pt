import { fakeBuildContext, makeVault } from '@profullstack/sh1pt-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import target from './index.js';

describe('payment-square target adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct package metadata', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../package.json');
    expect(pkg.name).toBe('@profullstack/sh1pt-target-payment-square');
  });

  it('creates payments with validated amount, currency, and sourceId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payment: { id: 'pay_123' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await target.build(fakeBuildContext({
      secret: makeVault({
        SQUARE_ACCESS_TOKEN: 'square-token',
        SQUARE_LOCATION_ID: 'loc_123',
      }),
    }) as any, {
      command: 'create',
      args: { amount: 1500, currency: 'usd', sourceId: 'cnon:card-nonce' },
    });

    expect(result).toEqual({
      artifact: 'square-payment-create',
      meta: { raw: JSON.stringify({ payment: { id: 'pay_123' } }) },
    });
    expect(fetchMock).toHaveBeenCalledWith('https://connect.squareup.com/v2/payments', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer square-token',
        'Content-Type': 'application/json',
      }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body).toMatchObject({
      source_id: 'cnon:card-nonce',
      amount_money: { amount: 1500, currency: 'USD' },
      location_id: 'loc_123',
    });
  });

  it('rejects invalid create amounts before calling Square', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(target.build(fakeBuildContext({
      secret: makeVault({ SQUARE_ACCESS_TOKEN: 'square-token' }),
    }) as any, {
      command: 'create',
      args: { amount: 1.5, currency: 'USD', sourceId: 'cnon:card-nonce' },
    })).rejects.toThrow('amount must be a positive integer');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid currency codes before calling Square', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(target.build(fakeBuildContext({
      secret: makeVault({ SQUARE_ACCESS_TOKEN: 'square-token' }),
    }) as any, {
      command: 'create',
      args: { amount: 1500, currency: 'US', sourceId: 'cnon:card-nonce' },
    })).rejects.toThrow('currency must be a three-letter ISO code');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a sourceId for create commands', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(target.build(fakeBuildContext({
      secret: makeVault({ SQUARE_ACCESS_TOKEN: 'square-token' }),
    }) as any, {
      command: 'create',
      args: { amount: 1500, currency: 'USD', sourceId: '   ' },
    })).rejects.toThrow('sourceId required');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires payment IDs for get, cancel, and refund commands', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ctx = fakeBuildContext({
      secret: makeVault({ SQUARE_ACCESS_TOKEN: 'square-token' }),
    }) as any;

    await expect(target.build(ctx, {
      command: 'get',
      args: { paymentId: '  ' },
    })).rejects.toThrow('paymentId required');

    await expect(target.build(ctx, {
      command: 'cancel',
      args: {},
    })).rejects.toThrow('paymentId required');

    await expect(target.build(ctx, {
      command: 'refund',
      args: {},
    })).rejects.toThrow('paymentId required');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
