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
  sampleConfig: { command: 'create', args: { amount: 100, currency: 'USD' } },
});

beforeEach(() => {
  vi.clearAllMocks();
  execMock.mockResolvedValue({ exitCode: 0, stdout: '{"ok":true}', stderr: '' });
});

describe('payment-paypal target adapter', () => {
  it('normalizes create currency before invoking the PayPal CLI', async () => {
    const ctx = fakeShipContext({ dryRun: false });

    await target.ship(ctx as any, {
      command: 'create',
      args: { amount: 25.5, currency: 'usd' },
      description: 'Test order',
    });

    expect(execMock).toHaveBeenCalledWith('paypal', [
      'orders',
      'create',
      '--amount',
      '25.5',
      '--currency',
      'USD',
      '--description',
      'Test order',
    ], {
      log: ctx.log,
      throwOnNonZero: true,
    });
  });

  it('rejects invalid create amounts before invoking the PayPal CLI', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'create',
      args: { amount: 0, currency: 'USD' },
    })).rejects.toThrow('amount must be a positive number');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects invalid currency codes before invoking the PayPal CLI', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'create',
      args: { amount: 10, currency: 'US' },
    })).rejects.toThrow('currency must be a three-letter ISO code');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('requires IDs for order lookup, capture, and refund commands', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'get',
      args: { orderId: '   ' },
    })).rejects.toThrow('orderId required');

    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'capture',
      args: {},
    })).rejects.toThrow('orderId required');

    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'refund',
      args: {},
    })).rejects.toThrow('captureId required');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('requires a positive integer list limit', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'list',
      args: { limit: 1.5 },
    })).rejects.toThrow('limit must be a positive integer');

    expect(execMock).not.toHaveBeenCalled();
  });
});
