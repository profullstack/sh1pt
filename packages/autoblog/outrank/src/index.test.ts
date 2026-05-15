import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestAutoblog, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestAutoblog(adapter, {
  sampleConfig: {},
  requiredSecrets: ['OUTRANK_WEBHOOK_URL'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('autoblog-outrank publishing', () => {
  it('posts an article payload with optional HMAC signature', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 202,
      statusText: 'Accepted',
      text: async () => JSON.stringify({ id: 'job_123', status: 'queued', url: 'https://outrank.so/jobs/job_123' }),
    } as any);

    const ctx = {
      ...fakeConnectContext({
        OUTRANK_WEBHOOK_URL: 'https://hooks.outrank.so/sh1pt',
        OUTRANK_WEBHOOK_SECRET: 'secret',
      }),
      dryRun: false,
    };

    const result = await adapter.publish(ctx as any, {
      title: 'Release shipped',
      bodyMarkdown: '# Release shipped',
      canonicalUrl: 'https://example.com/release',
      tags: ['launch', 'automation'],
    }, {
      siteId: 'site_1',
      workflowId: 'workflow_1',
      publishMode: 'draft',
    });

    expect(result).toMatchObject({
      id: 'job_123',
      provider: 'outrank',
      status: 'queued',
      url: 'https://outrank.so/jobs/job_123',
      responseStatus: 202,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://hooks.outrank.so/sh1pt');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'content-type': 'application/json',
      'X-Sh1pt-Provider': 'outrank',
    });
    expect(String(((init as RequestInit).headers as Record<string, string>)['X-Sh1pt-Signature'])).toMatch(/^sha256=/);
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      source: 'sh1pt',
      provider: 'outrank',
      siteId: 'site_1',
      workflowId: 'workflow_1',
      publishMode: 'draft',
      article: {
        title: 'Release shipped',
        body_markdown: '# Release shipped',
        canonical_url: 'https://example.com/release',
        tags: ['launch', 'automation'],
      },
    });
  });
});
