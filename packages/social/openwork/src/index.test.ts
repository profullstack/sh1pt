import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { jobId: 'abc-123' },
  samplePost: { body: 'Here is my submission for the job.' },
  requiredSecrets: ['OPENWORK_API_KEY'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-openwork adapter', () => {
  it('connects with valid API key and returns agent info', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'agent-42', name: 'erica-ai' }),
    } as any);

    const ctx = fakeConnectContext({ OPENWORK_API_KEY: 'test-key' });
    const result = await adapter.connect(ctx as any, {});

    expect(result.accountId).toBe('agent-42');
    expect(fetch).toHaveBeenCalledWith(
      'https://www.openwork.bot/api/agents/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      }),
    );
  });

  it('throws when OPENWORK_API_KEY is missing from connect', async () => {
    const ctx = fakeConnectContext({});
    await expect(adapter.connect(ctx as any, {})).rejects.toThrow('OPENWORK_API_KEY not in vault');
  });

  it('submits work to a job via POST /jobs/:id/submit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ submission: { id: 'sub-789' } }),
    } as any);

    const ctx = {
      secret: (k: string) => k === 'OPENWORK_API_KEY' ? 'test-key' : undefined,
      log: () => {},
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'My completed work',
      link: 'https://github.com/example/pr/1',
    }, { jobId: 'abc-123' });

    expect(result.id).toBe('sub-789');
    expect(result.url).toBe('https://www.openwork.bot/jobs/abc-123');
    expect(result.platform).toBe('openwork');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.openwork.bot/api/jobs/abc-123/submit');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.content).toBe('My completed work');
    expect(body.artifacts).toEqual([{ type: 'url', url: 'https://github.com/example/pr/1' }]);
  });

  it('throws if no jobId is provided', async () => {
    const ctx = {
      secret: (k: string) => k === 'OPENWORK_API_KEY' ? 'test-key' : undefined,
      log: () => {},
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, { body: 'test' }, {})).rejects.toThrow('jobId');
  });

  it('extracts jobId from title pattern "job: <id>"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'ow_123' }),
    } as any);

    const ctx = {
      secret: (k: string) => k === 'OPENWORK_API_KEY' ? 'test-key' : undefined,
      log: () => {},
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Work submission',
      title: 'job: f47ac10b-58cc-4372-a567-0e02b2c3d479',
    }, {});

    expect(result.id).toBeTruthy();
  });

  it('returns dry-run result without making API calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const ctx = {
      secret: (k: string) => k === 'OPENWORK_API_KEY' ? 'test-key' : undefined,
      log: () => {},
      dryRun: true,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Test submission',
    }, { jobId: 'dry-run-job' });

    expect(result.id).toBe('dry-run');
    expect(result.url).toBe('https://www.openwork.bot/jobs/dry-run-job');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on API error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Job already submitted',
    } as any);

    const ctx = {
      secret: (k: string) => k === 'OPENWORK_API_KEY' ? 'test-key' : undefined,
      log: () => {},
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, { body: 'Work' }, { jobId: 'abc-123' }))
      .rejects.toThrow('openwork submit failed: HTTP 422');
  });
});
