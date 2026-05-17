import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { instance: 'mastodon.social', visibility: 'unlisted' },
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['MASTODON_TOKEN_MASTODON_SOCIAL'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-mastodon posting', () => {
  it('creates a Mastodon status with token auth, visibility, links, and hashtags', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: '109246',
        url: 'https://mastodon.social/@sh1pt/109246',
        created_at: '2026-05-11T20:00:00Z',
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ MASTODON_TOKEN_MASTODON_SOCIAL: 'mastodon-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Release notes',
      hashtags: ['sh1pt', 'typescript'],
      link: 'https://sh1pt.com',
    }, { instance: 'https://mastodon.social/', visibility: 'unlisted' });

    expect(result).toEqual({
      id: '109246',
      url: 'https://mastodon.social/@sh1pt/109246',
      platform: 'mastodon',
      publishedAt: '2026-05-11T20:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://mastodon.social/api/v1/statuses');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer mastodon-token',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      status: 'Release notes\n\nhttps://sh1pt.com #sh1pt #typescript',
      visibility: 'unlisted',
    });
  });

  it('throws Mastodon API error messages when status creation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => JSON.stringify({ error: 'Validation failed: Text character limit of 500 exceeded' }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ MASTODON_TOKEN_MASTODON_SOCIAL: 'mastodon-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Release notes',
    }, { instance: 'mastodon.social' })).rejects.toThrow('Text character limit');
  });

  it('does not silently drop media attachments', async () => {
    const ctx = {
      ...fakeConnectContext({ MASTODON_TOKEN_MASTODON_SOCIAL: 'mastodon-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Release notes',
      media: [{ file: './image.png', kind: 'image' }],
    }, { instance: 'mastodon.social' })).rejects.toThrow('media uploads');
  });
});
