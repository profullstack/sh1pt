import { contractTestSocial } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

const samplePost = {
  title: 'Launch demo',
  body: 'A short product walkthrough.',
  link: 'https://example.com',
  hashtags: ['launch', 'demo'],
  media: [{ kind: 'video' as const, file: 'https://cdn.example.com/demo.mp4' }],
};

contractTestSocial(adapter, {
  sampleConfig: { baseUrl: 'https://vimeo.test' },
  samplePost,
  requiredSecrets: ['VIMEO_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-vimeo', () => {
  it('connects to the authenticated Vimeo account', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      uri: '/users/12345',
      link: 'https://vimeo.com/user12345',
      name: 'Demo Publisher',
    }));

    await expect(adapter.connect(ctx({ VIMEO_ACCESS_TOKEN: 'mock-vimeo-token' }), {
      baseUrl: 'https://vimeo.test',
    })).resolves.toEqual({ accountId: '12345' });

    expect(fetchMock).toHaveBeenCalledWith('https://vimeo.test/me', {
      headers: {
        authorization: 'Bearer mock-vimeo-token',
        accept: 'application/json',
        'content-type': 'application/json',
      },
    });
  });

  it('creates a pull-upload Vimeo video from a public video URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      uri: '/videos/987654',
      link: 'https://vimeo.com/987654',
      name: 'Launch demo',
      created_time: '2026-05-21T09:30:00+00:00',
    }, 201));

    await expect(adapter.post({
      ...ctx({ VIMEO_ACCESS_TOKEN: 'mock-vimeo-token' }),
      dryRun: false,
    }, samplePost, {
      baseUrl: 'https://vimeo.test/',
      privacyView: 'unlisted',
      folderUri: '/users/12345/projects/456',
    })).resolves.toEqual({
      id: '987654',
      url: 'https://vimeo.com/987654',
      platform: 'vimeo',
      publishedAt: '2026-05-21T09:30:00+00:00',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://vimeo.test/me/videos');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer mock-vimeo-token',
      accept: 'application/json',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Launch demo',
      description: 'A short product walkthrough.\n\nhttps://example.com\n\n#launch\n\n#demo',
      upload: {
        approach: 'pull',
        link: 'https://cdn.example.com/demo.mp4',
      },
      privacy: { view: 'unlisted' },
      folder_uri: '/users/12345/projects/456',
    });
  });

  it('includes password privacy when configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      uri: '/videos/13579',
    }, 201));

    await adapter.post({
      ...ctx({ VIMEO_ACCESS_TOKEN: 'mock-vimeo-token' }),
      dryRun: false,
    }, samplePost, {
      baseUrl: 'https://vimeo.test',
      privacyView: 'password',
      password: 'preview-password',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      privacy: { view: 'password', password: 'preview-password' },
    });
  });

  it('rejects local video paths because pull uploads need public URLs', async () => {
    await expect(adapter.post({
      ...ctx({ VIMEO_ACCESS_TOKEN: 'mock-vimeo-token' }),
      dryRun: true,
    }, {
      ...samplePost,
      media: [{ kind: 'video' as const, file: '/tmp/demo.mp4' }],
    }, {
      baseUrl: 'https://vimeo.test',
    })).rejects.toThrow('public http(s) video URL');
  });

  it('redacts the access token from Vimeo API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      developer_message: 'Invalid token mock-vimeo-token for this upload',
    }, 401, 'Unauthorized'));

    await expect(adapter.post({
      ...ctx({ VIMEO_ACCESS_TOKEN: 'mock-vimeo-token' }),
      dryRun: false,
    }, samplePost, {
      baseUrl: 'https://vimeo.test',
    })).rejects.toThrow('Invalid token [redacted] for this upload');
  });
});

function ctx(secrets: Record<string, string>) {
  return {
    secret(key: string) {
      return secrets[key];
    },
    log: vi.fn(),
  };
}

function jsonResponse(json: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => json,
  } as Response;
}
