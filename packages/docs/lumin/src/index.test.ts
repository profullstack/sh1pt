import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'docs', requireSupports: true });

const ctx = (
  secrets: Record<string, string> = { LUMIN_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('docs-lumin document creation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ LUMIN_API_KEY: 'test-key' }, true), {
      kind: 'pitch-deck',
      title: 'Seed Deck',
      format: 'pdf',
    }, {});

    expect(result).toEqual({
      id: 'dry-run',
      format: 'pdf',
      url: 'https://app.luminpdf.com/viewer/stub',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a hosted PDF document from a file URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'doc_abc123',
        name: 'Investor Memo',
        preview_url: 'https://app.luminpdf.com/viewer/doc_abc123',
        mime_type: 'application/pdf',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), {
      kind: 'one-pager',
      title: 'Investor Memo',
      format: 'pdf',
    }, {
      fileUrl: 'https://files.example.com/investor-memo.pdf',
      folderId: 'folder_123',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.luminpdf.com/v1/documents');
    expect(request.headers).toEqual({
      'X-API-Key': 'test-key',
      accept: 'application/json',
      'content-type': 'application/json',
    });
    expect(JSON.parse(request.body)).toEqual({
      method: 'file-upload',
      document_name: 'Investor Memo',
      location: {
        type: 'workspace',
        folder_id: 'folder_123',
      },
      document_data: {
        file_url: 'https://files.example.com/investor-memo.pdf',
      },
    });
    expect(result).toEqual({
      id: 'doc_abc123',
      format: 'pdf',
      url: 'https://app.luminpdf.com/viewer/doc_abc123',
    });
  });

  it('creates a document from a PDF template and variables', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'doc_template',
        preview_url: 'https://app.luminpdf.com/viewer/doc_template',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), {
      kind: 'proposal',
      title: 'Signed Proposal',
      format: 'pdf',
      templateId: 'pdf_123',
      variables: {
        'Client.Name': 'Acme Corp',
        'Document.EffectiveDate': '2026-05-21',
      },
    }, {
      baseUrl: 'https://api-sandbox.luminpdf.com/v1/',
      locationType: 'space',
      spaceId: 'space_456',
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api-sandbox.luminpdf.com/v1/documents');
    expect(JSON.parse(request.body)).toEqual({
      method: 'template',
      document_name: 'Signed Proposal',
      location: {
        type: 'space',
        space_id: 'space_456',
      },
      document_data: {
        template_id: 'pdf_123',
        fields: {
          'Client.Name': 'Acme Corp',
          'Document.EffectiveDate': '2026-05-21',
        },
      },
    });
  });

  it('rejects unsupported output formats', async () => {
    await expect(adapter.generate(ctx(), {
      kind: 'proposal',
      title: 'Proposal',
      format: 'docx',
    }, {})).rejects.toThrow('only hosts PDFs');
  });

  it('requires a file URL or PDF template for live uploads', async () => {
    await expect(adapter.generate(ctx(), {
      kind: 'whitepaper',
      title: 'Whitepaper',
      format: 'pdf',
    }, {})).rejects.toThrow('config.fileUrl or spec.templateId');
  });

  it('redacts API keys from provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad key test-key',
    }));

    await expect(adapter.generate(ctx(), {
      kind: 'whitepaper',
      title: 'Whitepaper',
      format: 'pdf',
    }, {
      fileUrl: 'https://files.example.com/whitepaper.pdf',
    })).rejects.toThrow('Lumin 401: bad key [redacted]');
  });
});
