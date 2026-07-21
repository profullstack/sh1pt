import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import { describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

const ctx = {
  secret: (key: string) => key === 'EXE_DEV_TOKEN' ? 'test-token' : undefined,
  log: vi.fn(),
  dryRun: true,
};

describe('exe.dev numeric options', () => {
  it('quotes positive decimal CPU, memory, and disk values', async () => {
    const quote = await adapter.quote(ctx as any, {
      kind: 'cpu-vps',
      cpu: '2',
      memory: '4.5',
      storage: '20',
    } as any, {});

    expect(quote.sku).toBe('2cpu-4.5gb-20gb');
  });

  it('rejects non-decimal CPU, memory, and disk strings instead of falling back', async () => {
    await expect(adapter.quote(ctx as any, { kind: 'cpu-vps', cpu: '1e2' } as any, {}))
      .rejects.toThrow('exe.dev cpu must be a positive decimal number');
    await expect(adapter.quote(ctx as any, { kind: 'cpu-vps', memory: '0x10' } as any, {}))
      .rejects.toThrow('exe.dev memory must be a positive decimal number');
    await expect(adapter.quote(ctx as any, { kind: 'cpu-vps', storage: '-1' } as any, {}))
      .rejects.toThrow('exe.dev disk must be a positive decimal number');
  });

  it('keeps dry-run provision args decimal and deterministic', async () => {
    const instance = await adapter.provision(ctx as any, {
      kind: 'cpu-vps',
      cpu: '2',
      memory: '4',
      storage: '20',
    } as any, {});

    expect(instance.sku).toBe('2cpu-4gb-20gb');
  });
});

contractTestCloud(adapter, {
  sampleConfig: {},
  sampleSpec: { kind: 'cpu-vps', cpu: 2, memory: 4, storage: 20 },
  requiredSecrets: ['EXE_DEV_TOKEN'],
});
