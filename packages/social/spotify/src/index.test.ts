import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: {},
  samplePost: { title: 'Hello Spotify', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['SPOTIFY_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-spotify playlist publishing', () => {
  it('connects by reading the current Spotify profile', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'spotify_user_123' }),
    } as Response);

    const result = await adapter.connect(fakeConnectContext({ SPOTIFY_ACCESS_TOKEN: 'spotify-token' }), {});

    expect(result).toEqual({ accountId: 'spotify_user_123' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.spotify.com/v1/me');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      authorization: 'Bearer spotify-token',
      accept: 'application/json',
    });
  });

  it('creates a public playlist and appends normalized Spotify items', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({
          id: 'playlist_123',
          external_urls: { spotify: 'https://open.spotify.com/playlist/playlist_123' },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ snapshot_id: 'snapshot_123' }),
      } as Response);

    const ctx = {
      ...fakeConnectContext({ SPOTIFY_ACCESS_TOKEN: 'spotify-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Launch tracks',
      body: 'Songs for the launch',
      link: 'https://sh1pt.com',
      hashtags: ['ship'],
    }, {
      trackUris: [
        'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
        'https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ?si=abc',
      ],
      position: 0,
    });

    expect(result).toEqual({
      id: 'playlist_123',
      url: 'https://open.spotify.com/playlist/playlist_123',
      platform: 'spotify',
      publishedAt: expect.any(String),
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.spotify.com/v1/me/playlists');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      name: 'Launch tracks',
      description: 'Songs for the launch\nhttps://sh1pt.com #ship',
      public: true,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.spotify.com/v1/playlists/playlist_123/items');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      uris: [
        'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
        'spotify:episode:512ojhOuo1ktJprKbVcKyQ',
      ],
      position: 0,
    });
  });

  it('updates an existing playlist and replaces its items', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ snapshot_id: 'snapshot_replace' }),
      } as Response);

    const ctx = {
      ...fakeConnectContext({ SPOTIFY_ACCESS_TOKEN: 'spotify-token' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      title: 'Updated name',
      body: 'Updated description',
    }, {
      playlistId: 'playlist_existing',
      public: false,
      collaborative: true,
      replaceItems: true,
      trackUris: ['spotify:track:1301WleyT98MSxVHPZCA6M'],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.spotify.com/v1/playlists/playlist_existing');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('PUT');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      name: 'Updated name',
      description: 'Updated description',
      public: false,
      collaborative: true,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.spotify.com/v1/playlists/playlist_existing/items');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('PUT');
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      uris: ['spotify:track:1301WleyT98MSxVHPZCA6M'],
    });
  });

  it('rejects non-Spotify playlist item identifiers', async () => {
    const ctx = {
      ...fakeConnectContext({ SPOTIFY_ACCESS_TOKEN: 'spotify-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Bad URI',
      body: 'Body',
    }, {
      trackUris: ['https://example.com/not-spotify'],
    })).rejects.toThrow('spotify:track/episode URIs');
  });

  it('redacts token values from Spotify API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({
        error: { message: 'The access token spotify-secret-token expired' },
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ SPOTIFY_ACCESS_TOKEN: 'spotify-secret-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Launch tracks',
      body: 'Songs for the launch',
    }, {})).rejects.toThrow('The access token [redacted] expired');
  });
});
