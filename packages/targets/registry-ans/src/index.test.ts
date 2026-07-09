import { contractTestTarget, fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'registry', requireKind: true });

contractTestTarget(adapter, {
  sampleConfig: { agentName: 'sample-agent', domain: 'example.com' },
});

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('ANS registry target', () => {
  it('writes a manifest with the ans:// name and DNS challenge record', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-ans-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir, version: '1.2.3' }) as any, {
      agentName: 'my-agent',
      domain: 'example.com',
      endpoint: 'https://my-agent.example.com',
      capabilities: ['chat', 'search'],
    });

    expect(result.artifact).toBe(join(outDir, 'ans-manifest.json'));
    const manifest = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(manifest).toMatchObject({
      provider: 'registry-ans',
      ansName: 'ans://v1.2.3.my-agent.example.com',
      agentName: 'my-agent',
      version: '1.2.3',
      domain: 'example.com',
      endpoint: 'https://my-agent.example.com',
      capabilities: ['chat', 'search'],
      verify: 'dns',
      challenge: { type: 'TXT', name: '_ans-challenge.my-agent.example.com', value: null },
    });
  });

  it('dry-run ship returns the registration plan without touching the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await adapter.ship(fakeShipContext({ version: '0.4.0' }) as any, {
      agentName: 'my-agent',
      domain: 'example.com',
      dns: { provider: 'dns-cloudflare', zoneId: 'zone-1' },
    });

    expect(result.id).toBe('ans://v0.4.0.my-agent.example.com');
    expect(result.meta).toMatchObject({
      ansName: 'ans://v0.4.0.my-agent.example.com',
      verify: 'dns',
      challenge: { type: 'TXT', name: '_ans-challenge.my-agent.example.com', value: null },
      dryRun: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('real ship requires ANS_API_TOKEN', async () => {
    await expect(
      adapter.ship(fakeShipContext({ dryRun: false }) as any, { agentName: 'my-agent', domain: 'example.com' }),
    ).rejects.toThrow('ANS_API_TOKEN not in vault');
  });

  it('real ship registers and emits the issued TXT challenge record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ challengeToken: 'tok-abc123', recordName: '_ans-challenge.my-agent.example.com' }),
    })));

    const result = await adapter.ship(
      fakeShipContext({ dryRun: false, version: '2.0.0', secret: (k: string) => (k === 'ANS_API_TOKEN' ? 'test-token' : undefined) }) as any,
      { agentName: 'my-agent', domain: 'example.com', endpoint: 'https://my-agent.example.com' },
    );

    expect(result.id).toBe('ans://v2.0.0.my-agent.example.com');
    expect(result.meta).toMatchObject({
      challenge: { type: 'TXT', name: '_ans-challenge.my-agent.example.com', value: 'tok-abc123' },
      status: 'pending-verification',
    });
  });

  it('rejects an invalid agentName', () => {
    expect(() => adapter.validate?.({ agentName: 'bad name!', domain: 'example.com' })).toThrow('invalid agentName');
  });
});
