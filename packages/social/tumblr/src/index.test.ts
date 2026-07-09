import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { blogIdentifier: 'sh1pt.tumblr.com' },
  samplePost: { title: 'Hello Tumblr', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['TUMBLR_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-tumblr posting', () => {
  it('creates an NPF post with Tumblr OAuth2 bearer auth', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        meta: { status: 201, msg: 'Created' },
        response: { id: '1234567891234567' },
      }),
    } as Response);

    const scheduled = new Date('2026-05-20T12:00:00.000Z');
    const ctx = {
      ...fakeConnectContext({ TUMBLR_ACCESS_TOKEN: 'tumblr-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Release notes',
      body: 'First paragraph.\n\nSecond paragraph.',
      hashtags: ['ship', 'typescript', 'automation'],
      link: 'https://sh1pt.com',
      schedule: scheduled,
    }, {
      blogIdentifier: 'sh1pt.tumblr.com',
      state: 'draft',
      slug: 'release-notes',
      sourceUrl: 'https://example.com/source',
    });

    expect(result).toEqual({
      id: '1234567891234567',
      url: 'https://sh1pt.tumblr.com/post/1234567891234567',
      platform: 'tumblr',
      publishedAt: '2026-05-20T12:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.tumblr.com/v2/blog/sh1pt.tumblr.com/posts');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer tumblr-token',
      'content-type': 'application/json',
      'user-agent': '@profullstack/sh1pt-social-tumblr',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      content: [
        { type: 'text', subtype: 'heading1', text: 'Release notes' },
        { type: 'text', text: 'First paragraph.' },
        { type: 'text', text: 'Second paragraph.' },
        { type: 'link', url: 'https://sh1pt.com' },
      ],
      state: 'queue',
      publish_on: '2026-05-20T12:00:00.000Z',
      tags: 'ship,typescript,automation',
      source_url: 'https://example.com/source',
      slug: 'release-notes',
    });
  });

  it('surfaces Tumblr API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        meta: { status: 400, msg: 'Bad Request' },
        errors: [{ title: "'content' must be an array", code: 8001 }],
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ TUMBLR_ACCESS_TOKEN: 'tumblr-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Release notes',
      body: 'Body',
    }, {
      blogIdentifier: 'sh1pt.tumblr.com',
    })).rejects.toThrow("'content' must be an array");
  });
});
