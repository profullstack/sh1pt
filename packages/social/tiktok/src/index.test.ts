import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

const tempDirs: string[] = [];

contractTestSocial(adapter, {
  sampleConfig: { mode: 'upload-only' },
  samplePost: {
    body: 'hello from sh1pt contract tests',
    media: [{ file: tempVideoFile(), kind: 'video' }],
  },
  requiredSecrets: ['TIKTOK_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('social-tiktok content posting', () => {
  it('initializes a direct post and uploads local video bytes', async () => {
    const videoFile = tempVideoFile('clip.mp4', new Uint8Array([1, 2, 3, 4]));
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          publish_id: 'v_pub_file~v2.123',
          upload_url: 'https://open-upload.tiktokapis.example/video/?upload_id=123&upload_token=abc',
        },
        error: { code: 'ok', message: '' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('', { status: 201, statusText: 'Created' }));

    const ctx = {
      ...fakeConnectContext({ TIKTOK_ACCESS_TOKEN: 'tiktok-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Launch clip',
      link: 'https://sh1pt.com',
      hashtags: ['ship', 'typescript'],
      media: [{ file: videoFile, kind: 'video', durationSec: 12 }],
    }, {
      mode: 'direct-post',
      privacyLevel: 'SELF_ONLY',
      disableComment: true,
      disableDuet: false,
      disableStitch: true,
      videoCoverTimestampMs: 1000,
      brandContent: false,
      brandOrganic: true,
      isAigc: true,
      apiBaseUrl: 'https://open.tiktokapis.example',
      profileUrl: 'https://www.tiktok.com/@sh1pt',
    });

    expect(result).toEqual({
      id: 'v_pub_file~v2.123',
      url: 'https://www.tiktok.com/@sh1pt',
      platform: 'tiktok',
      publishedAt: expect.any(String),
    });

    const [initUrl, initRequest] = fetchMock.mock.calls[0]!;
    expect(initUrl).toBe('https://open.tiktokapis.example/v2/post/publish/video/init/');
    expect((initRequest as RequestInit).headers).toMatchObject({
      authorization: 'Bearer tiktok-token',
      'content-type': 'application/json; charset=UTF-8',
    });
    expect(JSON.parse(String((initRequest as RequestInit).body))).toEqual({
      post_info: {
        title: 'Launch clip\nhttps://sh1pt.com\n#ship #typescript',
        privacy_level: 'SELF_ONLY',
        disable_duet: false,
        disable_comment: true,
        disable_stitch: true,
        video_cover_timestamp_ms: 1000,
        brand_content_toggle: false,
        brand_organic_toggle: true,
        is_aigc: true,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: 4,
        chunk_size: 4,
        total_chunk_count: 1,
      },
    });

    const [uploadUrl, uploadRequest] = fetchMock.mock.calls[1]!;
    expect(uploadUrl).toBe('https://open-upload.tiktokapis.example/video/?upload_id=123&upload_token=abc');
    expect((uploadRequest as RequestInit).method).toBe('PUT');
    expect((uploadRequest as RequestInit).headers).toMatchObject({
      'content-length': '4',
      'content-type': 'video/mp4',
      'content-range': 'bytes 0-3/4',
    });
    expect((uploadRequest as RequestInit).body).toBeInstanceOf(Uint8Array);
  });

  it('uses upload-only inbox init with PULL_FROM_URL for public video URLs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: { publish_id: 'v_inbox_url~v2.456' },
      error: { code: 'ok', message: '' },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const ctx = {
      ...fakeConnectContext({ TIKTOK_ACCESS_TOKEN: 'tiktok-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Remote clip',
      media: [{ file: 'https://cdn.example.com/tiktok.webm', kind: 'video' }],
    }, {
      mode: 'upload-only',
      apiBaseUrl: 'https://open.tiktokapis.example/',
    });

    expect(result).toMatchObject({
      id: 'v_inbox_url~v2.456',
      url: 'https://www.tiktok.com/upload',
      platform: 'tiktok',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://open.tiktokapis.example/v2/post/publish/inbox/video/init/');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: 'https://cdn.example.com/tiktok.webm',
      },
    });
  });

  it('rejects posts without video media', async () => {
    const ctx = {
      ...fakeConnectContext({ TIKTOK_ACCESS_TOKEN: 'tiktok-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Missing video',
      media: [{ file: 'https://cdn.example.com/still.jpg', kind: 'image' }],
    }, {})).rejects.toThrow('video attachment');
  });

  it('redacts the access token from API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: 'access_token_invalid',
        message: 'Token tiktok-token is invalid',
      },
    }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'content-type': 'application/json' },
    }));

    const ctx = {
      ...fakeConnectContext({ TIKTOK_ACCESS_TOKEN: 'tiktok-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Denied',
      media: [{ file: tempVideoFile(), kind: 'video' }],
    }, {
      apiBaseUrl: 'https://open.tiktokapis.example',
    })).rejects.toThrow('Token [redacted] is invalid');
  });
});

function tempVideoFile(name = 'video.mp4', bytes = new Uint8Array([0, 1, 2])): string {
  const dir = mkdtempSync(join(tmpdir(), 'sh1pt-tiktok-'));
  tempDirs.push(dir);
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return file;
}
