import { fakeBuildContext, makeVault } from '@profullstack/sh1pt-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import target from './index.js';

describe('payment-adyen target adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct package metadata', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../package.json');
    expect(pkg.name).toBe('@profullstack/sh1pt-target-payment-adyen');
  });

  it('creates payments with validated amount and currency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resultCode: 'RedirectShopper' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await target.build(fakeBuildContext({
      secret: makeVault({
        ADYEN_API_KEY: 'adyen-key',
        ADYEN_MERCHANT_ACCOUNT: 'merchant-account',
      }),
    }) as any, {
      command: 'payment',
      args: { amount: 1500, currency: 'usd' },
    });

    expect(result).toEqual({
      artifact: 'adyen-payment-create',
      meta: { raw: JSON.stringify({ resultCode: 'RedirectShopper' }) },
    });
    expect(fetchMock).toHaveBeenCalledWith('https://checkout-test.adyen.com/v71/payments', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'X-API-Key': 'adyen-key',
        'Content-Type': 'application/json',
      }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body).toMatchObject({
      amount: { value: 1500, currency: 'USD' },
      merchantAccount: 'merchant-account',
      channel: 'web',
    });
  });

  it('rejects invalid payment amounts before calling Adyen', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(target.build(fakeBuildContext({
      secret: makeVault({
        ADYEN_API_KEY: 'adyen-key',
        ADYEN_MERCHANT_ACCOUNT: 'merchant-account',
      }),
    }) as any, {
      command: 'payment',
      args: { amount: 0, currency: 'USD' },
    })).rejects.toThrow('amount must be a positive integer');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid currencies before calling Adyen', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(target.build(fakeBuildContext({
      secret: makeVault({
        ADYEN_API_KEY: 'adyen-key',
        ADYEN_MERCHANT_ACCOUNT: 'merchant-account',
      }),
    }) as any, {
      command: 'payment',
      args: { amount: 1500, currency: 'US' },
    })).rejects.toThrow('currency must be a three-letter ISO code');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires pspReference for capture, refund, and cancel commands', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ctx = fakeBuildContext({
      secret: makeVault({
        ADYEN_API_KEY: 'adyen-key',
        ADYEN_MERCHANT_ACCOUNT: 'merchant-account',
      }),
    }) as any;

    await expect(target.build(ctx, {
      command: 'capture',
      args: { pspReference: '  ' },
    })).rejects.toThrow('pspReference required');

    await expect(target.build(ctx, {
      command: 'refund',
      args: {},
    })).rejects.toThrow('pspReference required');

    await expect(target.build(ctx, {
      command: 'cancel',
      args: {},
    })).rejects.toThrow('pspReference required');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates optional capture amount before calling Adyen', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(target.build(fakeBuildContext({
      secret: makeVault({
        ADYEN_API_KEY: 'adyen-key',
        ADYEN_MERCHANT_ACCOUNT: 'merchant-account',
      }),
    }) as any, {
      command: 'capture',
      args: { pspReference: 'psp_123', amount: 1.5, currency: 'USD' },
    })).rejects.toThrow('amount must be a positive integer');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks all payment status when no pspReference is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payments: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await target.build(fakeBuildContext({
      secret: makeVault({
        ADYEN_API_KEY: 'adyen-key',
        ADYEN_MERCHANT_ACCOUNT: 'merchant-account',
      }),
    }) as any, {
      command: 'status',
      args: {},
    });

    expect(result).toEqual({
      artifact: 'adyen-payment-status',
      meta: { raw: JSON.stringify({ payments: [] }) },
    });
    expect(fetchMock).toHaveBeenCalledWith('https://checkout-test.adyen.com/v71/payments', expect.any(Object));
  });
});
