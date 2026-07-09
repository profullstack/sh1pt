import { contractTestTarget, fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'chat', requireKind: true });

const sampleConfig = {
  phoneNumber: '+14155551234',
  runtime: 'signal-cli' as const,
  captchaToken: 'test-captcha-token',
  deviceName: 'sh1pt-test',
};

contractTestTarget(adapter, { sampleConfig });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Signal target planning', () => {
  it('writes an inspectable runtime plan without storing the captcha token', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-signal-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir }) as any, sampleConfig);
    expect(result.artifact).toBe(join(outDir, 'signal-runtime', 'signal-runtime-plan.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      phoneNumber: '+14155551234',
      runtime: 'signal-cli',
      deviceName: 'sh1pt-test',
      captchaTokenPresent: true,
    });
  });

  it('rejects invalid Signal config before writing a plan or registering', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      phoneNumber: '415-555-1234',
      runtime: 'signal-cli',
    })).rejects.toThrow('phoneNumber must be a valid E.164 number');

    await expect(adapter.build(fakeBuildContext() as any, {
      phoneNumber: '+14155551234',
      runtime: 'desktop',
    } as any)).rejects.toThrow('runtime must be signal-cli or signald');

    await expect(adapter.build(fakeBuildContext() as any, {
      phoneNumber: '+14155551234',
      runtime: 'signal-cli',
      deviceName: '',
    })).rejects.toThrow('chat-signal requires deviceName');

    await expect(adapter.ship(fakeShipContext({ dryRun: false }) as any, {
      phoneNumber: '+14155551234',
      runtime: 'signal-cli',
    })).rejects.toThrow('requires captchaToken for Signal registration');
  });
});
