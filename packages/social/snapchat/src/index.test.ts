import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

const tempDirs: string[] = [];

contractTestSocial(adapter, {
  sampleConfig: { profileId: 'profile_123', adAccountId: 'ad_123' },
  samplePost: {
    body: 'hello from sh1pt contract tests',
    media: [{ file: tempMediaFile('snap.jpg'), kind: 'image' }],
  },
  requiredSecrets: ['SNAPCHAT_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('social-snapchat public profile publishing', () => {
  it('creates media, uploads a local image, and posts it as a Story', async () => {
    const mediaFile = tempMediaFile('story.jpg', new Uint8Array([1, 2, 3]));
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        request_status: 'success',
        media: [{
          sub_request_status: 'success',
          media: { id: 'media_123', media_status: 'PENDING_UPLOAD' },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        request_status: 'success',
        result: { id: 'media_123', media_status: 'READY' },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        request_id: 'story_request_123',
        request_status: 'SUCCESS',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const ctx = {
      ...fakeConnectContext({ SNAPCHAT_ACCESS_TOKEN: 'snap-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Story body',
      media: [{ file: mediaFile, kind: 'image' }],
    }, {
      profileId: 'profile_123',
      adAccountId: 'ad_123',
      mode: 'story',
      mediaName: 'Story asset',
      adsApiBaseUrl: 'https://adsapi.snapchat.example',
      businessApiBaseUrl: 'https://businessapi.snapchat.example',
      profileUrl: 'https://www.snapchat.com/add/sh1pt',
    });

    expect(result).toEqual({
      id: 'story_request_123',
      url: 'https://www.snapchat.com/add/sh1pt',
      platform: 'snapchat',
      publishedAt: expect.any(String),
    });

    const [createUrl, createRequest] = fetchMock.mock.calls[0]!;
    expect(createUrl).toBe('https://adsapi.snapchat.example/v1/adaccounts/ad_123/media');
    expect((createRequest as RequestInit).headers).toMatchObject({
      authorization: 'Bearer snap-token',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String((createRequest as RequestInit).body))).toEqual({
      media: [{
        name: 'Story asset',
        type: 'IMAGE',
        ad_account_id: 'ad_123',
      }],
    });

    const [uploadUrl, uploadRequest] = fetchMock.mock.calls[1]!;
    expect(uploadUrl).toBe('https://adsapi.snapchat.example/v1/media/media_123/upload');
    expect((uploadRequest as RequestInit).method).toBe('POST');
    expect((uploadRequest as RequestInit).headers).toEqual({ authorization: 'Bearer snap-token' });
    expect((uploadRequest as RequestInit).body).toBeInstanceOf(FormData);

    const [storyUrl, storyRequest] = fetchMock.mock.calls[2]!;
    expect(storyUrl).toBe('https://businessapi.snapchat.example/v1/public_profiles/profile_123/stories');
    expect(JSON.parse(String((storyRequest as RequestInit).body))).toEqual({ media_id: 'media_123' });
  });

  it('fetches remote video media and posts it as a Spotlight', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(new Uint8Array([8, 9, 10, 11]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        request_status: 'SUCCESS',
        media: [{
          sub_request_status: 'SUCCESS',
          media: { id: 'media_video_456' },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_status: 'SUCCESS' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        request_id: 'spotlight_request_456',
        spotlight_id: 'spotlight_456',
        request_status: 'SUCCESS',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const ctx = {
      ...fakeConnectContext({ SNAPCHAT_ACCESS_TOKEN: 'snap-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Spotlight body',
      link: 'https://sh1pt.com',
      hashtags: ['ship', 'snap'],
      media: [{ file: 'https://cdn.example.com/clip.mp4', kind: 'video', durationSec: 9 }],
    }, {
      profileId: 'profile_123',
      adAccountId: 'ad_123',
      mode: 'spotlight',
      locale: 'en_GB',
      skipSaveToProfile: true,
      adsApiBaseUrl: 'https://adsapi.snapchat.example/',
      businessApiBaseUrl: 'https://businessapi.snapchat.example/',
    });

    expect(result).toMatchObject({
      id: 'spotlight_456',
      url: 'https://www.snapchat.com/',
      platform: 'snapchat',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cdn.example.com/clip.mp4');
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      media: [{
        name: 'clip.mp4',
        type: 'VIDEO',
        ad_account_id: 'ad_123',
      }],
    });
    expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body))).toEqual({
      media_id: 'media_video_456',
      skip_save_to_profile: true,
      description: 'Spotlight body https://sh1pt.com #ship #snap',
      locale: 'en_GB',
    });
  });

  it('rejects Spotlight posts without video media', async () => {
    const ctx = {
      ...fakeConnectContext({ SNAPCHAT_ACCESS_TOKEN: 'snap-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Image spotlight',
      media: [{ file: tempMediaFile('snap.jpg'), kind: 'image' }],
    }, {
      profileId: 'profile_123',
      adAccountId: 'ad_123',
      mode: 'spotlight',
    })).rejects.toThrow('Spotlight posts require video media');
  });

  it('requires an adAccountId for the media creation step', async () => {
    const ctx = {
      ...fakeConnectContext({ SNAPCHAT_ACCESS_TOKEN: 'snap-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Missing ad account',
      media: [{ file: tempMediaFile('snap.jpg'), kind: 'image' }],
    }, {
      profileId: 'profile_123',
    })).rejects.toThrow('adAccountId');
  });

  it('redacts the access token from API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      request_status: 'ERROR',
      display_message: 'Token snap-token is invalid',
    }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'content-type': 'application/json' },
    }));

    const ctx = {
      ...fakeConnectContext({ SNAPCHAT_ACCESS_TOKEN: 'snap-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Denied',
      media: [{ file: tempMediaFile('snap.jpg'), kind: 'image' }],
    }, {
      profileId: 'profile_123',
      adAccountId: 'ad_123',
      adsApiBaseUrl: 'https://adsapi.snapchat.example',
    })).rejects.toThrow('Token [redacted] is invalid');
  });
});

function tempMediaFile(name = 'snap.jpg', bytes = new Uint8Array([0, 1, 2])): string {
  const dir = mkdtempSync(join(tmpdir(), 'sh1pt-snapchat-'));
  tempDirs.push(dir);
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return file;
}
