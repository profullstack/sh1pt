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
  sampleConfig: { command: 'create', args: { amount: 100, blockchain: 'BTC' }, businessId: 'biz_test' },
});

beforeEach(() => {
  vi.clearAllMocks();
  execMock.mockResolvedValue({ exitCode: 0, stdout: '{"ok":true}', stderr: '' });
});

describe('payment-coinpay target adapter', () => {
  it('creates payments with validated amount, businessId, and blockchain', async () => {
    const ctx = fakeShipContext({ dryRun: false });

    await target.ship(ctx as any, {
      command: 'create',
      businessId: 'biz_test',
      args: { amount: 25.5, blockchain: 'sol' },
      description: 'Test payment',
    });

    expect(execMock).toHaveBeenCalledWith('coinpay', [
      'payment',
      'create',
      '--business-id',
      'biz_test',
      '--amount',
      '25.5',
      '--blockchain',
      'SOL',
      '--description',
      'Test payment',
    ], {
      log: ctx.log,
      throwOnNonZero: true,
    });
  });

  it('rejects invalid create amounts before invoking the CLI', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'create',
      args: { amount: 0, blockchain: 'BTC' },
    })).rejects.toThrow('amount must be a positive number');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects blank business IDs before invoking the CLI', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'create',
      businessId: '   ',
      args: { amount: 10, blockchain: 'BTC' },
    })).rejects.toThrow('businessId required');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('requires paymentId for get commands', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'get',
      args: { paymentId: '  ' },
    })).rejects.toThrow('paymentId required');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('normalizes rate asset codes before invoking the CLI', async () => {
    const ctx = fakeShipContext({ dryRun: false });

    await target.ship(ctx as any, {
      command: 'rates',
      args: { coin: 'sol', fiat: 'usd' },
    });

    expect(execMock).toHaveBeenCalledWith('coinpay', ['rates', 'get', 'SOL', '--fiat', 'USD'], {
      log: ctx.log,
    });
  });

  it('rejects malformed rate asset codes before invoking the CLI', async () => {
    await expect(target.ship(fakeShipContext({ dryRun: false }) as any, {
      command: 'rates',
      args: { coin: 'sol-mainnet', fiat: 'USD' },
    })).rejects.toThrow('coin must be an uppercase asset code');

    expect(execMock).not.toHaveBeenCalled();
  });
});
