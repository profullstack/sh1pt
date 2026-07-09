import 'server-only';
import { createPrivateKey, createSign } from 'node:crypto';
import { env, isGithubAppConfigured } from './env';

export { isGithubAppConfigured } from './env';

// sh1pt platform-level GitHub App helpers. Credentials live in Railway
// env vars (set via the App Manifest flow at /admin/github/setup);
// we never persist them to the DB.
//
// Two tokens are in play:
//  - App JWT: signed with the App's private key (RS256), valid 10 minutes.
//    Used for app-level endpoints like GET /app and minting installation tokens.
//  - Installation token: short-lived (~1h), minted per installation, used for
//    repo-level reads/writes (contents, pull-requests, etc.).
//
// We NEVER persist installation tokens — they're requested on-demand and
// kept in-memory for the duration of a single request.

export const GITHUB_API_BASE = 'https://api.github.com';

export interface GithubAppStatus {
  configured: boolean;
  app_id: string;
  app_slug: string;
  client_id_set: boolean;
  client_secret_set: boolean;
  private_key_set: boolean;
  webhook_secret_set: boolean;
}

export function githubAppStatus(): GithubAppStatus {
  return {
    configured: isGithubAppConfigured(),
    app_id: env.githubAppId,
    app_slug: env.githubAppSlug,
    client_id_set: Boolean(env.githubAppClientId),
    client_secret_set: Boolean(env.githubAppClientSecret),
    private_key_set: Boolean(env.githubAppPrivateKey),
    webhook_secret_set: Boolean(env.githubAppWebhookSecret),
  };
}

// ---------- JWT (RS256) ----------

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Mint a short-lived GitHub App JWT (RS256). 10-minute max lifetime per
 * GitHub's spec; we set iat 30s in the past to absorb minor clock drift.
 *
 * Railway env vars sometimes arrive with literal "\n" sequences instead of
 * real newlines (depends on how the admin pasted them) — normalize before
 * signing.
 */
export function mintAppJwt(): string {
  if (!env.githubAppId) throw new Error('GITHUB_APP_ID is not configured');
  if (!env.githubAppPrivateKey) throw new Error('GITHUB_APP_PRIVATE_KEY is not configured');

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now - 30, exp: now + 9 * 60, iss: env.githubAppId };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pem = env.githubAppPrivateKey.replace(/\\n/g, '\n');
  const key = createPrivateKey({ key: pem, format: 'pem' });
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(key));

  return `${signingInput}.${signature}`;
}

// ---------- GitHub API fetch ----------

export interface GithubFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token: string;
}

export interface GithubFetchResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function githubFetch<T = unknown>(
  path: string,
  options: GithubFetchOptions,
): Promise<GithubFetchResult<T>> {
  const url = `${GITHUB_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${options.token}`,
    'User-Agent': 'sh1pt-actions-fleet',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }

  const text = await response.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message = isObject(parsed) && typeof parsed.message === 'string' ? parsed.message : response.statusText;
    return { ok: false, status: response.status, error: message };
  }
  return { ok: true, status: response.status, data: parsed as T };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ---------- Installation token ----------

export interface InstallationTokenResponse {
  token: string;
  expires_at: string;
  repository_selection?: 'all' | 'selected';
  permissions?: Record<string, string>;
}

export async function mintInstallationToken(
  installationId: number,
): Promise<GithubFetchResult<InstallationTokenResponse>> {
  const jwt = mintAppJwt();
  return githubFetch<InstallationTokenResponse>(
    `/app/installations/${installationId}/access_tokens`,
    { method: 'POST', token: jwt },
  );
}

// ---------- Installation lookup ----------

export interface AppInstallation {
  id: number;
  account: {
    login: string;
    id: number;
    type: 'User' | 'Organization';
    avatar_url?: string;
  };
  repository_selection: 'all' | 'selected';
  permissions: Record<string, string>;
}

export async function getInstallation(
  installationId: number,
): Promise<GithubFetchResult<AppInstallation>> {
  const jwt = mintAppJwt();
  return githubFetch<AppInstallation>(`/app/installations/${installationId}`, { token: jwt });
}

// ---------- App Manifest conversion ----------

export interface AppManifestConversionResponse {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string | null;
  pem: string;
  owner: { login: string };
  html_url: string;
}

/**
 * Convert a one-shot manifest code into a freshly-provisioned GitHub App.
 * GitHub gives us app_id + pem + client id/secret + webhook secret here,
 * then the code is invalidated. Result goes in the URL fragment to keep
 * it out of server logs.
 * See https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 */
export async function convertAppManifest(
  code: string,
): Promise<GithubFetchResult<AppManifestConversionResponse>> {
  const url = `${GITHUB_API_BASE}/app-manifests/${encodeURIComponent(code)}/conversions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sh1pt-actions-fleet',
      },
    });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message = isObject(parsed) && typeof parsed.message === 'string' ? parsed.message : res.statusText;
    return { ok: false, status: res.status, error: message };
  }
  return { ok: true, status: res.status, data: parsed as AppManifestConversionResponse };
}
