import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeConnectContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

smokeTest(adapter, { idPrefix: 'observability' });

afterEach(() => {
  spawnMock.mockReset();
});

describe('observability-sentry release publishing', () => {
  it('requires a Sentry auth token with a sh1pt vault hint', async () => {
    await expect(adapter.connect(fakeConnectContext({}) as any, {
      org: 'acme',
      project: 'web',
    })).rejects.toThrow('sh1pt secret set SENTRY_AUTH_TOKEN');

    await expect(adapter.createRelease(fakeConnectContext({}) as any, {
      version: '1.2.3',
    }, {
      org: 'acme',
      project: 'web',
    })).rejects.toThrow('sh1pt secret set SENTRY_AUTH_TOKEN');
  });

  it('creates, uploads sourcemaps, finalizes, and records deploys through sentry-cli', async () => {
    spawnMock.mockImplementation(fakeSuccessfulProcess);

    const result = await adapter.createRelease(fakeConnectContext({
      SENTRY_AUTH_TOKEN: 'token',
    }) as any, {
      version: '1.2.3',
      environment: 'production',
      artifacts: ['dist/assets'],
    }, {
      org: 'acme',
      project: 'web',
    });

    expect(result).toEqual({
      id: '1.2.3',
      url: 'https://sentry.io/organizations/acme/releases/1.2.3/',
    });
    expect(spawnMock).toHaveBeenCalledTimes(4);
    expect(spawnMock.mock.calls.map(([cmd]) => cmd)).toEqual([
      'sentry-cli',
      'sentry-cli',
      'sentry-cli',
      'sentry-cli',
    ]);
    expect(spawnMock.mock.calls[0]![1]).toEqual([
      'releases', 'new', '1.2.3',
      '--org', 'acme',
      '--project', 'web',
    ]);
    expect(spawnMock.mock.calls[1]![1]).toEqual([
      'sourcemaps', 'upload', 'dist/assets',
      '--release', '1.2.3',
      '--org', 'acme',
      '--project', 'web',
    ]);
    expect(spawnMock.mock.calls[2]![1]).toEqual([
      'releases', 'finalize', '1.2.3',
      '--org', 'acme',
      '--project', 'web',
    ]);
    expect(spawnMock.mock.calls[3]![1]).toEqual([
      'releases', 'deploys', '1.2.3', 'new',
      '--env', 'production',
      '--org', 'acme',
    ]);
    const spawnOpts = spawnMock.mock.calls[0]![2] as { env: Record<string, string> };
    expect(spawnOpts.env.SENTRY_AUTH_TOKEN).toBe('token');
  });
});

function fakeSuccessfulProcess(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => child.emit('close', 0));
  return child;
}
