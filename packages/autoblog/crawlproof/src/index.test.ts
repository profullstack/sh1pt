import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestAutoblog, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestAutoblog(adapter, {
  sampleConfig: {},
  requiredSecrets: ['CRAWLPROOF_WEBHOOK_URL'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('autoblog-crawlproof publishing', () => {
  it('posts a CrawlProof-shaped article payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ requestId: 'req_456', status: 'published', url: 'https://crawlproof.com/articles/req_456' }),
    } as any);

    const ctx = {
      ...fakeConnectContext({
        CRAWLPROOF_WEBHOOK_URL: 'https://hooks.crawlproof.com/sh1pt',
        CRAWLPROOF_WEBHOOK_SECRET: 'secret',
      }),
      dryRun: false,
    };

    const result = await adapter.publish(ctx as any, {
      title: 'Launch notes',
      bodyMarkdown: 'Markdown body',
      sourceUrl: 'https://example.com/source',
      tags: ['seo'],
    }, {
      projectId: 'project_1',
      collection: 'blog',
      publishMode: 'publish',
    });

    expect(result).toMatchObject({
      id: 'req_456',
      provider: 'crawlproof',
      status: 'published',
      url: 'https://crawlproof.com/articles/req_456',
      responseStatus: 200,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://hooks.crawlproof.com/sh1pt');
    expect((init as RequestInit).headers).toMatchObject({
      'content-type': 'application/json',
      'X-Sh1pt-Provider': 'crawlproof',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      source: 'sh1pt',
      provider: 'crawlproof',
      projectId: 'project_1',
      collection: 'blog',
      publishMode: 'publish',
      article: {
        title: 'Launch notes',
        markdown: 'Markdown body',
        sourceUrl: 'https://example.com/source',
        tags: ['seo'],
      },
    });
  });
});
