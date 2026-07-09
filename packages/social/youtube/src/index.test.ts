import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

const tempDirs: string[] = [];

contractTestSocial(adapter, {
  sampleConfig: { privacyStatus: 'unlisted' },
  samplePost: {
    title: 'Hello YouTube',
    body: 'hello from sh1pt contract tests',
    media: [{ file: tempVideoFile(), kind: 'video' }],
  },
  requiredSecrets: ['YOUTUBE_OAUTH_REFRESH_TOKEN', 'YOUTUBE_CLIENT_ID'],
});

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('social-youtube upload', () => {
  it('refreshes OAuth, creates a resumable upload session, and uploads the video bytes', async () => {
    const videoFile = tempVideoFile('clip.mp4', new Uint8Array([1, 2, 3, 4]));
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'newtok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('', {
        status: 200,
        headers: { location: 'https://uploads.youtube.example/session/123' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'abc123',
        snippet: { publishedAt: '2026-05-21T08:00:00Z' },
        status: { privacyStatus: 'unlisted' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const ctx = {
      ...fakeConnectContext({
        YOUTUBE_OAUTH_REFRESH_TOKEN: 'rt',
        YOUTUBE_CLIENT_ID: 'cid',
        YOUTUBE_CLIENT_SECRET: 'sec',
      }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Release demo',
      body: 'Video body',
      link: 'https://sh1pt.com',
      hashtags: ['ship', 'typescript'],
      media: [{ file: videoFile, kind: 'video', durationSec: 42 }],
    }, {
      category: '28',
      privacyStatus: 'unlisted',
      defaultLanguage: 'en',
      madeForKids: false,
      containsSyntheticMedia: true,
      embeddable: true,
      notifySubscribers: false,
      tokenUrl: 'https://oauth.example/token',
      uploadBaseUrl: 'https://www.googleapis.example',
    });

    expect(result).toEqual({
      id: 'abc123',
      url: 'https://www.youtube.com/watch?v=abc123',
      platform: 'youtube',
      publishedAt: '2026-05-21T08:00:00.000Z',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://oauth.example/token');
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)).toBe(
      'client_id=cid&refresh_token=rt&grant_type=refresh_token&client_secret=sec',
    );

    const [sessionUrl, sessionInit] = fetchMock.mock.calls[1]!;
    expect(sessionUrl).toBe('https://www.googleapis.example/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus&notifySubscribers=false');
    expect((sessionInit as RequestInit).method).toBe('POST');
    expect((sessionInit as RequestInit).headers).toMatchObject({
      authorization: 'Bearer newtok',
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': '4',
      'x-upload-content-type': 'video/mp4',
    });
    expect(JSON.parse(String((sessionInit as RequestInit).body))).toEqual({
      snippet: {
        channelId: undefined,
        title: 'Release demo',
        description: 'Video body\n\nhttps://sh1pt.com\n\n#ship #typescript',
        tags: ['ship', 'typescript'],
        categoryId: '28',
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: 'unlisted',
        publishAt: undefined,
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
        embeddable: true,
      },
    });

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[2]!;
    expect(uploadInit).toBeDefined();
    const uploadRequest = uploadInit as RequestInit;
    expect(uploadUrl).toBe('https://uploads.youtube.example/session/123');
    expect(uploadRequest.method).toBe('PUT');
    expect(uploadRequest.headers).toMatchObject({
      authorization: 'Bearer newtok',
      'content-length': '4',
      'content-type': 'video/mp4',
      'content-range': 'bytes 0-3/4',
    });
    expect(uploadRequest.body).toBeInstanceOf(Uint8Array);
  });

  it('can use an existing access token and fetch remote video media', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(new Uint8Array([5, 6, 7]), {
        status: 200,
        headers: { 'content-type': 'video/webm; charset=binary' },
      }))
      .mockResolvedValueOnce(new Response('', {
        status: 200,
        headers: { location: 'https://uploads.youtube.example/session/remote' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'remote123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const ctx = {
      ...fakeConnectContext({ YOUTUBE_ACCESS_TOKEN: 'sekret' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      body: 'Remote upload',
      media: [{ file: 'https://cdn.example.com/video.webm', kind: 'video' }],
    }, {
      privacyStatus: 'private',
      uploadBaseUrl: 'https://www.googleapis.example',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cdn.example.com/video.webm');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({
      authorization: 'Bearer sekret',
      'x-upload-content-length': '3',
      'x-upload-content-type': 'video/webm',
    });
  });

  it('forces scheduled uploads to private with publishAt metadata', async () => {
    const videoFile = tempVideoFile();
    const scheduled = new Date('2026-06-01T12:30:00.000Z');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { location: 'https://uploads.youtube.example/session/scheduled' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'scheduled123',
        status: { publishAt: '2026-06-01T12:30:00.000Z' },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const ctx = {
      ...fakeConnectContext({ YOUTUBE_ACCESS_TOKEN: 'sekret' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      title: 'Scheduled video',
      body: 'Scheduled body',
      schedule: scheduled,
      media: [{ file: videoFile, kind: 'video' }],
    }, {
      privacyStatus: 'public',
      uploadBaseUrl: 'https://www.googleapis.example',
    });

    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload.status).toMatchObject({
      privacyStatus: 'private',
      publishAt: '2026-06-01T12:30:00.000Z',
    });
  });

  it('rejects posts without video media', async () => {
    const ctx = {
      ...fakeConnectContext({ YOUTUBE_ACCESS_TOKEN: 'sekret' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Missing video',
      media: [{ file: 'https://cdn.example.com/still.jpg', kind: 'image' }],
    }, {})).rejects.toThrow('video attachment');
  });

  it('redacts OAuth secrets from token refresh errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_grant',
      error_description: 'Bad rt for cid',
    }), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' },
    }));

    const ctx = {
      ...fakeConnectContext({
        YOUTUBE_OAUTH_REFRESH_TOKEN: 'rt',
        YOUTUBE_CLIENT_ID: 'cid',
      }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Denied',
      media: [{ file: tempVideoFile(), kind: 'video' }],
    }, {
      tokenUrl: 'https://oauth.example/token',
    })).rejects.toThrow('Bad [redacted] for [redacted]');
  });

  it('surfaces YouTube upload errors without leaking the access token', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', {
        status: 200,
        headers: { location: 'https://uploads.youtube.example/session/error' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'Invalid token sekret' },
      }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json' },
      }));

    const ctx = {
      ...fakeConnectContext({ YOUTUBE_ACCESS_TOKEN: 'sekret' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Denied',
      media: [{ file: tempVideoFile(), kind: 'video' }],
    }, {
      uploadBaseUrl: 'https://www.googleapis.example',
    })).rejects.toThrow('Invalid token [redacted]');
  });
});

function tempVideoFile(name = 'video.mp4', bytes = new Uint8Array([0, 1, 2])): string {
  const dir = mkdtempSync(join(tmpdir(), 'sh1pt-youtube-'));
  tempDirs.push(dir);
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return file;
}
