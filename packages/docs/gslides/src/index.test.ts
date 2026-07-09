import { contractTestDocs } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

contractTestDocs(adapter, {
  sampleConfig: { templatePresentationId: 'template-123' },
  sampleSpec: {
    kind: 'pitch-deck',
    title: 'Seed Deck',
    format: 'pptx',
    variables: { company: 'Acme' },
  },
});

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const ctx = (
  secrets: Record<string, string> = { GSLIDES_ACCESS_TOKEN: 'access-token' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('docs-gslides generation', () => {
  it('copies a template, replaces text, exports the deck, and writes the file', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-gslides-'));
    tempDirs.push(outDir);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        id: 'copy-123',
        webViewLink: 'https://docs.google.com/presentation/d/copy-123/edit',
      }))
      .mockResolvedValueOnce(jsonResponse({ replies: [] }))
      .mockResolvedValueOnce(binaryResponse('pptx bytes'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), {
      kind: 'pitch-deck',
      title: 'Seed Deck',
      subtitle: 'Q2 fundraise',
      author: 'sh1pt',
      format: 'pptx',
      markdown: '# Slide 1',
      variables: { company: 'Acme', tagline: 'Ship faster' },
      templateId: 'template-123',
    }, {
      folderId: 'folder-456',
      outDir,
    });

    expect(result).toEqual({
      id: 'copy-123',
      format: 'pptx',
      url: 'https://docs.google.com/presentation/d/copy-123/edit',
      localPath: join(outDir, 'pitch-deck.pptx'),
    });
    await expect(readFile(join(outDir, 'pitch-deck.pptx'), 'utf-8')).resolves.toBe('pptx bytes');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [copyUrl, copyRequest] = fetchMock.mock.calls[0]!;
    expect(copyUrl).toBe('https://www.googleapis.com/drive/v3/files/template-123/copy?supportsAllDrives=true&fields=id%2CwebViewLink');
    expect(copyRequest).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(copyRequest.body))).toEqual({
      name: 'Seed Deck',
      parents: ['folder-456'],
    });

    const [batchUrl, batchRequest] = fetchMock.mock.calls[1]!;
    expect(batchUrl).toBe('https://slides.googleapis.com/v1/presentations/copy-123:batchUpdate');
    expect(batchRequest).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(batchRequest.body))).toEqual({
      requests: [
        replaceRequest('title', 'Seed Deck'),
        replaceRequest('subtitle', 'Q2 fundraise'),
        replaceRequest('author', 'sh1pt'),
        replaceRequest('markdown', '# Slide 1'),
        replaceRequest('body', '# Slide 1'),
        replaceRequest('company', 'Acme'),
        replaceRequest('tagline', 'Ship faster'),
      ],
    });

    const [exportUrl, exportRequest] = fetchMock.mock.calls[2]!;
    expect(exportUrl).toBe(
      'https://www.googleapis.com/drive/v3/files/copy-123/export?mimeType=application%2Fvnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(exportRequest.headers).toEqual({ authorization: 'Bearer access-token' });
  });

  it('exchanges a refresh token before calling Google APIs', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-gslides-refresh-'));
    tempDirs.push(outDir);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'fresh-access-token' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'copy-456' }))
      .mockResolvedValueOnce(jsonResponse({ replies: [] }))
      .mockResolvedValueOnce(binaryResponse('pdf bytes'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({
      GSLIDES_REFRESH_TOKEN: 'refresh-token',
      GSLIDES_CLIENT_ID: 'client-id',
      GSLIDES_CLIENT_SECRET: 'client-secret',
    }), {
      kind: 'sales-deck',
      title: 'Sales Deck',
      format: 'pdf',
    }, {
      templatePresentationId: 'template-456',
      outDir,
      tokenUrl: 'https://oauth.example.test/token',
    });

    expect(result).toMatchObject({
      id: 'copy-456',
      format: 'pdf',
      localPath: join(outDir, 'sales-deck.pdf'),
    });
    await expect(readFile(join(outDir, 'sales-deck.pdf'), 'utf-8')).resolves.toBe('pdf bytes');

    const [tokenUrl, tokenRequest] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe('https://oauth.example.test/token');
    expect(tokenRequest).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    expect(String(tokenRequest.body)).toBe(
      'grant_type=refresh_token&refresh_token=refresh-token&client_id=client-id&client_secret=client-secret',
    );
    expect(fetchMock.mock.calls[1]?.[1].headers.authorization).toBe('Bearer fresh-access-token');
  });

  it('supports exporting an existing presentation with convert()', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-gslides-convert-'));
    tempDirs.push(outDir);
    const fetchMock = vi.fn().mockResolvedValue(binaryResponse('html zip'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.convert?.(ctx(), 'presentation-789', 'html', { outDir });

    expect(result).toEqual({
      id: 'presentation-789',
      format: 'html',
      url: 'https://docs.google.com/presentation/d/presentation-789/edit',
      localPath: join(outDir, 'presentation-789.zip'),
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://www.googleapis.com/drive/v3/files/presentation-789/export?mimeType=application%2Fzip',
    );
    await expect(readFile(join(outDir, 'presentation-789.zip'), 'utf-8')).resolves.toBe('html zip');
  });

  it('reports missing Google credentials before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.generate(ctx({}, false), {
      kind: 'pitch-deck',
      title: 'Seed Deck',
      format: 'pdf',
      templateId: 'template-123',
    }, {})).rejects.toThrow('GSLIDES_ACCESS_TOKEN or GSLIDES_REFRESH_TOKEN');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts access tokens from Google API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'access-token cannot copy this file',
    }));

    await expect(adapter.generate(ctx(), {
      kind: 'pitch-deck',
      title: 'Seed Deck',
      format: 'pdf',
      templateId: 'template-123',
    }, {})).rejects.toThrow('Google Drive copy 403: [redacted] cannot copy this file');
  });
});

function replaceRequest(key: string, value: string): object {
  return {
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: true },
      replaceText: value,
    },
  };
}

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

function binaryResponse(data: string): Response {
  const bytes = new TextEncoder().encode(data);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => data,
  } as Response;
}
