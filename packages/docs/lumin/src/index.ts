import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { defineDocs, tokenSetup, type DocSpec } from '@profullstack/sh1pt-core';

// LuminPDF — PDF editor + hosting. API supports upload, signature
// flows, form fill, and branded viewer links. NOT a presentation
// generator — use it to host/edit a pitch deck PDF that docs-marp or
// docs-gslides produces. Pair adapters on generate() → convert() → upload.
interface Config {
  baseUrl?: string;
  workspaceId?: string;
  spaceId?: string;
  folderId?: string;
  fileUrl?: string;
  localPath?: string;
}

interface LuminDocumentSummary {
  id?: string;
  document_id?: string;
  name?: string;
  preview_url?: string;
  url?: string;
}

const DEFAULT_BASE_URL = 'https://api.luminpdf.com/v1';
const LUMIN_TOKEN_SECRET = 'LUMIN_API_KEY';

export default defineDocs<Config>({
  id: 'docs-lumin',
  label: 'LuminPDF (PDF hosting + edit)',
  supports: ['pdf'],

  async generate(ctx, spec, config) {
    const token = ctx.secret(LUMIN_TOKEN_SECRET);
    if (!token) throw new Error(`${LUMIN_TOKEN_SECRET} not in vault`);
    if (spec.format !== 'pdf') {
      throw new Error(`docs-lumin only hosts PDFs — generate with docs-marp / docs-gslides first, then upload here`);
    }
    ctx.log(`lumin document create · "${spec.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', format: 'pdf', url: 'https://app.luminpdf.com/viewer/stub' };

    const created = await createDocument(token, spec, config);
    return {
      id: created.id ?? created.document_id ?? spec.title,
      format: 'pdf',
      url: created.preview_url ?? created.url,
    };
  },

  setup: tokenSetup({
    secretKey: "LUMIN_API_KEY",
    label: "LuminPDF (sharable PDF hosting)",
    vendorDocUrl: "https://www.luminpdf.com/developer",
    steps: [
      "Open luminpdf.com \u2192 Developer \u2192 Create API key",
      "Copy the API key",
    ],
  }),
});

async function createDocument(token: string, spec: DocSpec, config: Config): Promise<LuminDocumentSummary> {
  const response = await fetch(endpoint(config, '/documents'), await requestInit(token, spec, config));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lumin API request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return await response.json() as LuminDocumentSummary;
}

async function requestInit(token: string, spec: DocSpec, config: Config): Promise<RequestInit> {
  const location = documentLocation(config);
  if (config.localPath) {
    const file = new Blob([await readFile(config.localPath)], { type: 'application/pdf' });
    const form = new FormData();
    form.set('method', 'file-upload');
    form.set('document_name', spec.title);
    if (location) form.set('location', JSON.stringify(location));
    form.set('file', file, basename(config.localPath));
    return {
      method: 'POST',
      headers: { 'X-API-Key': token },
      body: form,
    };
  }

  return {
    method: 'POST',
    headers: {
      'X-API-Key': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(documentPayload(spec, config, location)),
  };
}

function documentPayload(spec: DocSpec, config: Config, location: Record<string, string> | undefined) {
  if (spec.templateId) {
    return {
      method: 'template',
      document_name: spec.title,
      ...(location ? { location } : {}),
      document_data: {
        template_id: spec.templateId,
        fields: spec.variables ?? {},
      },
    };
  }

  if (config.fileUrl) {
    return {
      method: 'file-upload',
      document_name: spec.title,
      ...(location ? { location } : {}),
      document_data: { file_url: config.fileUrl },
    };
  }

  throw new Error('docs-lumin requires config.fileUrl, config.localPath, or spec.templateId');
}

function documentLocation(config: Config): Record<string, string> | undefined {
  if (config.spaceId) {
    return {
      type: 'space',
      space_id: config.spaceId,
      ...(config.folderId ? { folder_id: config.folderId } : {}),
    };
  }
  if (config.workspaceId || config.folderId) {
    return {
      type: 'workspace',
      ...(config.workspaceId ? { workspace_id: config.workspaceId } : {}),
      ...(config.folderId ? { folder_id: config.folderId } : {}),
    };
  }
  return undefined;
}

function endpoint(config: Config, path: string): string {
  return `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}${path}`;
}
