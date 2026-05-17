import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import social from './index.js';

contractTestSocial(social, {
  sampleConfig: { handle: 'test.bsky.social' },
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['BLUESKY_APP_PASSWORD'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-bluesky posting', () => {
  it('creates a session and publishes a feed post record', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          did: 'did:plc:abc123',
          accessJwt: 'jwt-token',
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          uri: 'at://did:plc:abc123/app.bsky.feed.post/3kabc',
          cid: 'bafyreicid',
        }),
      } as any);

    const ctx = {
      ...fakeConnectContext({ BLUESKY_APP_PASSWORD: 'app-password' }),
      dryRun: false,
    };

    const result = await social.post(ctx as any, {
      body: 'Release shipped',
      link: 'https://sh1pt.com',
    }, {
      handle: 'sh1pt.bsky.social',
    });

    expect(result).toEqual({
      id: 'at://did:plc:abc123/app.bsky.feed.post/3kabc',
      url: 'https://bsky.app/profile/sh1pt.bsky.social/post/3kabc',
      platform: 'bluesky',
      publishedAt: expect.any(String),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://bsky.social/xrpc/com.atproto.server.createSession');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      identifier: 'sh1pt.bsky.social',
      password: 'app-password',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://bsky.social/xrpc/com.atproto.repo.createRecord');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({
      authorization: 'Bearer jwt-token',
      'content-type': 'application/json',
    });
    const recordPayload = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(recordPayload).toMatchObject({
      repo: 'did:plc:abc123',
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: 'Release shipped\nhttps://sh1pt.com',
      },
    });
    expect(recordPayload.record.createdAt).toEqual(expect.any(String));
  });

  it('surfaces Bluesky API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'AuthenticationRequired', message: 'Invalid identifier or password' }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ BLUESKY_APP_PASSWORD: 'bad-password' }),
      dryRun: false,
    };

    await expect(social.post(ctx as any, {
      body: 'Release shipped',
    }, {
      handle: 'sh1pt.bsky.social',
    })).rejects.toThrow('Invalid identifier or password');
  });
});
