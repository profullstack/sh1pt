import { defineDocs, oauthSetup, type DocFormat } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Google Slides: copy a template deck, merge {{variables}} through the
// Slides API, then export the generated presentation through Drive.
interface Config {
  templatePresentationId?: string;
  folderId?: string;
  outDir?: string;
  driveBaseUrl?: string;
  slidesBaseUrl?: string;
  tokenUrl?: string;
}

const DEFAULT_DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DEFAULT_SLIDES_BASE = 'https://slides.googleapis.com/v1';
const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const EXPORTS: Partial<Record<DocFormat, { mimeType: string; extension: string }>> = {
  pdf: { mimeType: 'application/pdf', extension: 'pdf' },
  pptx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx',
  },
  html: { mimeType: 'application/zip', extension: 'zip' },
};

export default defineDocs<Config>({
  id: 'docs-gslides',
  label: 'Google Slides (pitch decks)',
  supports: ['pptx', 'pdf', 'html'],

  async generate(ctx, spec, config) {
    const templateId = spec.templateId ?? config.templatePresentationId;
    if (!templateId) {
      throw new Error('docs-gslides needs a templateId: copy a Google Slides deck, share it with sh1pt, and pass its ID');
    }
    ensureSupported(spec.format);
    ensureGoogleCredential(ctx);

    const outputPath = outputFile(spec.kind, spec.format, config);
    const variables = mergeVariables(spec);
    ctx.log(`gslides - copy template ${templateId} - replace ${Object.keys(variables).length} vars`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        format: spec.format,
        url: 'https://docs.google.com/presentation/d/stub',
        localPath: outputPath,
      };
    }

    const token = await accessToken(ctx, config);
    const copied = await copyTemplate(token, templateId, spec.title, config);
    await replaceText(token, copied.id, variables, config);
    await exportPresentation(token, copied.id, spec.format, outputPath, config);

    return {
      id: copied.id,
      format: spec.format,
      url: copied.webViewLink ?? `https://docs.google.com/presentation/d/${copied.id}/edit`,
      localPath: outputPath,
    };
  },

  async convert(ctx, sourceId, to, config) {
    ensureSupported(to);
    ensureGoogleCredential(ctx);

    const outputPath = outputFile(sourceId, to, config);
    if (ctx.dryRun) return { id: sourceId, format: to, localPath: outputPath };

    const token = await accessToken(ctx, config);
    await exportPresentation(token, sourceId, to, outputPath, config);
    return {
      id: sourceId,
      format: to,
      url: `https://docs.google.com/presentation/d/${sourceId}/edit`,
      localPath: outputPath,
    };
  },

  setup: oauthSetup({
    secretKey: 'GSLIDES_ACCESS_TOKEN',
    label: 'Google Slides',
    vendorDocUrl: 'https://console.cloud.google.com/apis/credentials',
    steps: [
      'Enable Google Slides API and Google Drive API in Google Cloud',
      'Create OAuth 2.0 Client credentials (Desktop type)',
      'Store client ID with `sh1pt secret set GSLIDES_CLIENT_ID <client-id>`',
      'If Google issued a client secret, store it with `sh1pt secret set GSLIDES_CLIENT_SECRET <client-secret>`',
      'Store a refresh token with `sh1pt secret set GSLIDES_REFRESH_TOKEN <refresh-token>`, or paste a short-lived access token when prompted',
    ],
    loopback: process.env.SH1PT_GSLIDES_CLIENT_ID
      ? {
          clientId: process.env.SH1PT_GSLIDES_CLIENT_ID,
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: DEFAULT_TOKEN_URL,
          scopes: [
            'https://www.googleapis.com/auth/presentations',
            'https://www.googleapis.com/auth/drive.file',
          ],
          refreshSecretKey: 'GSLIDES_REFRESH_TOKEN',
          extraAuthParams: { access_type: 'offline', prompt: 'consent' },
        }
      : undefined,
  }),
});

interface DriveCopyResponse {
  id?: string;
  webViewLink?: string;
}

interface TokenResponse {
  access_token?: string;
}

type TextVariables = Record<string, string>;

function ensureGoogleCredential(ctx: { secret(k: string): string | undefined }): void {
  if (ctx.secret('GSLIDES_ACCESS_TOKEN') || ctx.secret('GOOGLE_OAUTH_ACCESS_TOKEN')) return;
  if (ctx.secret('GSLIDES_REFRESH_TOKEN') || ctx.secret('GOOGLE_OAUTH_REFRESH_TOKEN')) return;
  throw new Error('GSLIDES_ACCESS_TOKEN or GSLIDES_REFRESH_TOKEN not in vault');
}

async function accessToken(ctx: { secret(k: string): string | undefined }, config: Config): Promise<string> {
  const existing = ctx.secret('GSLIDES_ACCESS_TOKEN') ?? ctx.secret('GOOGLE_OAUTH_ACCESS_TOKEN');
  if (existing) return existing;

  const refreshToken = ctx.secret('GSLIDES_REFRESH_TOKEN') ?? ctx.secret('GOOGLE_OAUTH_REFRESH_TOKEN');
  if (!refreshToken) throw new Error('GSLIDES_REFRESH_TOKEN not in vault');

  const clientId = ctx.secret('GSLIDES_CLIENT_ID') ?? ctx.secret('GOOGLE_OAUTH_CLIENT_ID');
  if (!clientId) throw new Error('GSLIDES_CLIENT_ID not in vault');

  const clientSecret = ctx.secret('GSLIDES_CLIENT_SECRET') ?? ctx.secret('GOOGLE_OAUTH_CLIENT_SECRET');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(config.tokenUrl ?? DEFAULT_TOKEN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google OAuth ${res.status}: ${redact(await res.text(), [refreshToken, clientId, clientSecret])}`);
  }

  const data = await res.json() as TokenResponse;
  if (!data.access_token) throw new Error('Google OAuth response missing access_token');
  return data.access_token;
}

async function copyTemplate(
  token: string,
  templateId: string,
  title: string,
  config: Config,
): Promise<{ id: string; webViewLink?: string }> {
  const url = new URL(`${baseUrl(config.driveBaseUrl ?? DEFAULT_DRIVE_BASE)}/files/${encodeURIComponent(templateId)}/copy`);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,webViewLink');

  const body = {
    name: title,
    ...(config.folderId ? { parents: [config.folderId] } : {}),
  };

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: googleJsonHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Drive copy ${res.status}: ${redact(await res.text(), [token])}`);

  const data = await res.json() as DriveCopyResponse;
  if (!data.id) throw new Error('Google Drive copy response missing id');
  return { id: data.id, webViewLink: data.webViewLink };
}

async function replaceText(
  token: string,
  presentationId: string,
  variables: TextVariables,
  config: Config,
): Promise<void> {
  const requests = Object.entries(variables).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: true },
      replaceText: value,
    },
  }));
  if (requests.length === 0) return;

  const url = `${baseUrl(config.slidesBaseUrl ?? DEFAULT_SLIDES_BASE)}/presentations/${encodeURIComponent(presentationId)}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: googleJsonHeaders(token),
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Google Slides batchUpdate ${res.status}: ${redact(await res.text(), [token])}`);
}

async function exportPresentation(
  token: string,
  presentationId: string,
  format: DocFormat,
  outputPath: string,
  config: Config,
): Promise<void> {
  const exportSpec = ensureSupported(format);
  const url = new URL(`${baseUrl(config.driveBaseUrl ?? DEFAULT_DRIVE_BASE)}/files/${encodeURIComponent(presentationId)}/export`);
  url.searchParams.set('mimeType', exportSpec.mimeType);

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google Drive export ${res.status}: ${redact(await res.text(), [token])}`);

  await mkdir(config.outDir ?? join('.', '.sh1pt', 'docs'), { recursive: true });
  await writeFile(outputPath, Buffer.from(await res.arrayBuffer()));
}

function mergeVariables(spec: { title: string; subtitle?: string; author?: string; markdown?: string; variables?: TextVariables }): TextVariables {
  return {
    title: spec.title,
    ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
    ...(spec.author ? { author: spec.author } : {}),
    ...(spec.markdown ? { markdown: spec.markdown, body: spec.markdown } : {}),
    ...(spec.variables ?? {}),
  };
}

function ensureSupported(format: DocFormat): { mimeType: string; extension: string } {
  const exportSpec = EXPORTS[format];
  if (!exportSpec) throw new Error(`docs-gslides cannot export ${format}`);
  return exportSpec;
}

function outputFile(kindOrId: string, format: DocFormat, config: Config): string {
  const exportSpec = ensureSupported(format);
  const outDir = config.outDir ?? join('.', '.sh1pt', 'docs');
  return join(outDir, `${safeName(kindOrId)}.${exportSpec.extension}`);
}

function googleJsonHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

function baseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function safeName(value: string): string {
  const name = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return name || 'presentation';
}

function redact(value: string, secrets: Array<string | undefined>): string {
  let out = value;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('[redacted]');
  }
  return out.slice(0, 200);
}
