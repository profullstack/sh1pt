import { contractTestTarget, fakeShipContext } from '@profullstack/sh1pt-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import target from './index.js';

contractTestTarget(target, {
  sampleConfig: { command: 'create', args: { amount: 2000, currency: 'usd' }, description: 'test payment' },
});

beforeEach(() => {
  vi.clearAllMocks();
  execMock.mockResolvedValue({ exitCode: 0, stdout: '{"ok":true}', stderr: '' });
});

describe('payment-stripe target adapter', () => {
  it('normalizes currency before invoking the Stripe CLI', async () => {
    const ctx = fakeShipContext({ dryRun: false });

    await target.ship(ctx as any, {
      command: 'create',
      args: { amount: 2500, currency: 'USD' },
      description: 'Test payment',
    });

    expect(execMock).toHaveBeenCalledWith('stripe', [
      'payment_intents',
      'create',
      '--amount',
      '2500',
      '--currency',
      'usd',
      '--description',
      'Test payment',
    ], {
      log: ctx.log,
      throwOnNonZero: true,
    });
  });

  it('rejects invalid create amounts before invoking the Stripe CLI', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'create',
      args: { amount: 12.5, currency: 'usd' },
    })).rejects.toThrow('amount must be a positive integer');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects invalid currency codes before invoking the Stripe CLI', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'create',
      args: { amount: 1000, currency: 'US' },
    })).rejects.toThrow('currency must be a three-letter ISO code');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('requires payment intent IDs for get and refund commands', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'get',
      args: { paymentIntentId: '   ' },
    })).rejects.toThrow('paymentIntentId required');

    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'refund',
      args: {},
    })).rejects.toThrow('paymentIntentId required');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('requires a positive integer list limit', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'list',
      args: { limit: -1 },
    })).rejects.toThrow('limit must be a positive integer');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('requires a valid customer email', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'customer',
      args: { email: 'not-an-email' },
    })).rejects.toThrow('email must be a valid email address');

    expect(execMock).not.toHaveBeenCalled();
  });
});
