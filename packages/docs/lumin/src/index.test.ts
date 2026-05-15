import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'docs', requireSupports: true });

describe('Lumin document creation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a hosted document from a file URL', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        id: 'doc_123',
        preview_url: 'https://app.luminpdf.com/viewer/doc_123',
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    });

    const result = await adapter.generate(ctx(), {
      kind: 'one-pager',
      title: 'Investor One Pager',
      format: 'pdf',
    }, {
      baseUrl: 'https://api-sandbox.luminpdf.com/v1',
      fileUrl: 'https://files.example.com/one-pager.pdf',
      workspaceId: 'workspace_1',
      folderId: 'folder_1',
    });

    expect(result).toEqual({
      id: 'doc_123',
      format: 'pdf',
      url: 'https://app.luminpdf.com/viewer/doc_123',
    });
    expect(calls[0]!.url).toBe('https://api-sandbox.luminpdf.com/v1/documents');
    expect(calls[0]!.init.headers).toMatchObject({
      'X-API-Key': 'lumin_key',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      method: 'file-upload',
      document_name: 'Investor One Pager',
      location: {
        type: 'workspace',
        workspace_id: 'workspace_1',
        folder_id: 'folder_1',
      },
      document_data: {
        file_url: 'https://files.example.com/one-pager.pdf',
      },
    });
  });

  it('creates a document from a PDF template with variables', async () => {
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string)).toEqual({
        method: 'template',
        document_name: 'NDA',
        location: {
          type: 'space',
          space_id: 'space_1',
        },
        document_data: {
          template_id: 'pdf_template_123',
          fields: {
            'Client.Name': 'Acme Corp',
          },
        },
      });
      return new Response(JSON.stringify({ document_id: 'doc_template' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(adapter.generate(ctx(), {
      kind: 'contract',
      title: 'NDA',
      format: 'pdf',
      templateId: 'pdf_template_123',
      variables: {
        'Client.Name': 'Acme Corp',
      },
    }, {
      spaceId: 'space_1',
    })).resolves.toMatchObject({ id: 'doc_template', format: 'pdf' });
  });

  it('uploads a local PDF as multipart form data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sh1pt-lumin-'));
    const pdfPath = join(dir, 'deck.pdf');
    await writeFile(pdfPath, '%PDF-1.4\n');

    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      expect(init.headers).toEqual({ 'X-API-Key': 'lumin_key' });
      expect(init.body).toBeInstanceOf(FormData);
      const body = init.body as FormData;
      expect(body.get('method')).toBe('file-upload');
      expect(body.get('document_name')).toBe('Pitch Deck');
      expect(body.get('file')).toBeInstanceOf(File);
      return new Response(JSON.stringify({ id: 'doc_file' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(adapter.generate(ctx(), {
      kind: 'pitch-deck',
      title: 'Pitch Deck',
      format: 'pdf',
    }, {
      localPath: pdfPath,
    })).resolves.toMatchObject({ id: 'doc_file', format: 'pdf' });
  });

  it('requires a source document or template', async () => {
    await expect(adapter.generate(ctx(), {
      kind: 'one-pager',
      title: 'One Pager',
      format: 'pdf',
    }, {})).rejects.toThrow('config.fileUrl, config.localPath, or spec.templateId');
  });
});

function ctx() {
  return {
    secret: (key: string) => key === 'LUMIN_API_KEY' ? 'lumin_key' : undefined,
    log: () => {},
    dryRun: false,
  };
}
