import { defineDocs, tokenSetup } from '@profullstack/sh1pt-core';

// LuminPDF — PDF editor + hosting. API supports upload, signature
// flows, form fill, and branded viewer links. NOT a presentation
// generator — use it to host/edit a pitch deck PDF that docs-marp or
// docs-gslides produces. Pair adapters on generate() → convert() → upload.
interface Config {
  baseUrl?: string;
  fileUrl?: string;
  documentName?: string;
  locationType?: 'personal' | 'space' | 'workspace';
  spaceId?: string;
  folderId?: string;
  workspaceId?: string;
}

const DEFAULT_BASE = 'https://api.luminpdf.com/v1';

export default defineDocs<Config>({
  id: 'docs-lumin',
  label: 'LuminPDF (PDF hosting + edit)',
  supports: ['pdf'],

  async generate(ctx, spec, config) {
    const apiKey = ctx.secret('LUMIN_API_KEY');
    if (!apiKey) throw new Error('LUMIN_API_KEY not in vault');
    if (spec.format !== 'pdf') {
      throw new Error(`docs-lumin only hosts PDFs — generate with docs-marp / docs-gslides first, then upload here`);
    }
    const documentName = documentTitle(config.documentName ?? spec.title);
    ctx.log(`lumin document · "${documentName}"`);
    if (ctx.dryRun) return { id: 'dry-run', format: 'pdf', url: 'https://app.luminpdf.com/viewer/stub' };

    const body = createDocumentRequest(spec, config, documentName);
    const data = await createDocument(apiKey, body, config.baseUrl);

    return {
      id: data.id,
      format: 'pdf',
      url: data.preview_url,
    };
  },

  setup: tokenSetup({
    secretKey: "LUMIN_API_KEY",
    label: "LuminPDF (sharable PDF hosting)",
    vendorDocUrl: "https://developers.luminpdf.com/api/create-document/",
    steps: [
      "Open Lumin Settings -> Developer settings -> API keys",
      "Generate and copy the API key",
      "Paste below; sh1pt encrypts it in the vault",
    ],
  }),
});

interface LuminLocation {
  type: 'personal' | 'space' | 'workspace';
  space_id?: string;
  folder_id?: string;
}

interface LuminCreateDocumentRequest {
  method: 'file-upload' | 'template';
  document_name: string;
  location: LuminLocation;
  document_data:
    | { file_url: string }
    | { template_id: string; fields?: Record<string, string> };
}

interface LuminDocumentSummary {
  id: string;
  name?: string;
  preview_url: string;
  mime_type?: string;
}

function createDocumentRequest(
  spec: { templateId?: string; variables?: Record<string, string> },
  config: Config,
  documentName: string,
): LuminCreateDocumentRequest {
  const location = luminLocation(config);
  if (config.fileUrl) {
    return {
      method: 'file-upload',
      document_name: documentName,
      location,
      document_data: { file_url: config.fileUrl },
    };
  }

  if (spec.templateId) {
    return {
      method: 'template',
      document_name: documentName,
      location,
      document_data: {
        template_id: spec.templateId,
        ...(spec.variables ? { fields: spec.variables } : {}),
      },
    };
  }

  throw new Error('docs-lumin requires config.fileUrl or spec.templateId for live uploads');
}

function luminLocation(config: Config): LuminLocation {
  const type = config.locationType ?? (config.spaceId ? 'space' : config.folderId || config.workspaceId ? 'workspace' : 'personal');
  if (type === 'space' && !config.spaceId) {
    throw new Error('docs-lumin requires config.spaceId when locationType is "space"');
  }
  return {
    type,
    ...(config.spaceId ? { space_id: config.spaceId } : {}),
    ...(config.folderId ? { folder_id: config.folderId } : {}),
  };
}

function documentTitle(value: string): string {
  const title = value.trim().slice(0, 255);
  if (!title) throw new Error('docs-lumin requires a document title');
  return title;
}

async function createDocument(
  apiKey: string,
  body: LuminCreateDocumentRequest,
  baseUrl = DEFAULT_BASE,
): Promise<LuminDocumentSummary> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/documents`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Lumin ${res.status}: ${redact((await res.text()).slice(0, 200), apiKey)}`);
  }

  const data = await res.json() as Partial<LuminDocumentSummary>;
  if (!data.id || !data.preview_url) {
    throw new Error('Lumin response did not include document id and preview_url');
  }
  return {
    id: data.id,
    name: data.name,
    preview_url: data.preview_url,
    mime_type: data.mime_type,
  };
}

function redact(value: string, secret: string): string {
  return secret ? value.replaceAll(secret, '[redacted]') : value;
}
