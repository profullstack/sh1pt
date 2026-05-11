import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeConnectContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

smokeTest(adapter, { idPrefix: 'security' });

afterEach(() => {
  spawnMock.mockReset();
});

describe('security-snyk scanning', () => {
  it('requires a Snyk token with a sh1pt vault hint', async () => {
    await expect(adapter.connect(fakeConnectContext({}) as any, {}))
      .rejects.toThrow('sh1pt secret set SNYK_TOKEN');
    await expect(adapter.scan(fakeConnectContext({}) as any, { path: '.', kind: 'dependencies' }, {}))
      .rejects.toThrow('sh1pt secret set SNYK_TOKEN');
  });

  it('runs snyk test and maps dependency vulnerabilities even when snyk exits 1', async () => {
    spawnMock.mockImplementation(() => fakeProcess({
      stdout: JSON.stringify({
        vulnerabilities: [{
          id: 'SNYK-JS-MINIMIST-559764',
          title: 'Prototype Pollution',
          severity: 'high',
          packageName: 'minimist',
          from: ['root@1.0.0', 'minimist@0.0.8'],
        }],
      }),
      exitCode: 1,
    }));

    const result = await adapter.scan(fakeConnectContext({ SNYK_TOKEN: 'token' }) as any, {
      path: '.',
      kind: 'dependencies',
    }, {
      org: 'acme',
    });

    expect(result.findings).toEqual([{
      id: 'SNYK-JS-MINIMIST-559764',
      title: 'Prototype Pollution',
      severity: 'high',
      packageName: 'minimist',
      path: 'root@1.0.0 > minimist@0.0.8',
    }]);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe('snyk');
    expect(args).toEqual(['test', '.', '--org=acme', '--json']);
    expect((opts as { env: Record<string, string> }).env.SNYK_TOKEN).toBe('token');
  });

  it('uses the correct command families for container, IaC, and code scans', async () => {
    spawnMock.mockImplementation(() => fakeProcess({ stdout: '{}', exitCode: 0 }));
    const ctx = fakeConnectContext({ SNYK_TOKEN: 'token' }) as any;

    await adapter.scan(ctx, { path: 'app:latest', kind: 'container' }, {});
    await adapter.scan(ctx, { path: 'infra', kind: 'iac' }, {});
    await adapter.scan(ctx, { path: 'src', kind: 'code' }, {});

    expect(spawnMock.mock.calls.map((call) => call[1])).toEqual([
      ['container', 'test', 'app:latest', '--json'],
      ['iac', 'test', 'infra', '--json'],
      ['code', 'test', 'src', '--json'],
    ]);
  });
});

function fakeProcess(options: { stdout: string; stderr?: string; exitCode: number }): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    if (options.stdout) child.stdout.emit('data', Buffer.from(options.stdout));
    if (options.stderr) child.stderr.emit('data', Buffer.from(options.stderr));
    child.emit('close', options.exitCode);
  });
  return child;
}
