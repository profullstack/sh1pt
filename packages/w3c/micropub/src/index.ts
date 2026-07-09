import { defineW3cNamespace } from '@profullstack/sh1pt-core';

export type MicropubRequestFormat = 'json' | 'form';

export type MicropubPropertyValue =
  | string
  | number
  | boolean
  | null
  | readonly MicropubPropertyValue[]
  | {
      readonly type?: readonly string[];
      readonly properties?: MicropubProperties;
      readonly value?: unknown;
      readonly [key: string]: unknown;
    };

export type MicropubProperties = Record<string, MicropubPropertyValue | readonly MicropubPropertyValue[]>;

export interface PreparedMicropubRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

export interface MicropubDiscovery {
  sourceUrl: string;
  micropubEndpoint?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
}

export interface MicropubDiscoveryOptions {
  fetch?: FetchLike;
  accept?: string;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface MicropubCreateRequest {
  endpointUrl: string | URL;
  accessToken: string;
  type?: string | readonly string[];
  properties: MicropubProperties;
  format?: MicropubRequestFormat;
}

export interface MicropubUpdateRequest {
  endpointUrl: string | URL;
  accessToken: string;
  postUrl: string | URL;
  replace?: MicropubProperties;
  add?: MicropubProperties;
  delete?: readonly string[] | MicropubProperties;
}

export interface MicropubDeleteRequest {
  endpointUrl: string | URL;
  accessToken: string;
  postUrl: string | URL;
}

export interface MicropubConfigRequest {
  endpointUrl: string | URL;
  accessToken: string;
}

export interface MicropubConfiguration {
  mediaEndpoint?: string;
  syndicateTo?: unknown;
  raw: Record<string, unknown>;
}

export default defineW3cNamespace({
  id: 'w3c-micropub',
  label: 'Micropub',
  specUrl: 'https://www.w3.org/TR/micropub/',
  namespace: 'micropub',
  capabilities: ['discover', 'publish'],
  endpoints: [
    { id: 'endpoint-discovery', label: 'Micropub endpoint discovery', method: 'GET', rel: 'micropub' },
    { id: 'create', label: 'Create post', method: 'POST' },
    { id: 'update', label: 'Update post', method: 'POST' },
    { id: 'delete', label: 'Delete post', method: 'POST' },
    { id: 'media', label: 'Media endpoint', method: 'POST', pathHint: 'Discovered from q=config media-endpoint' },
  ],
});

export async function discoverMicropub(
  pageUrl: string | URL,
  options: MicropubDiscoveryOptions = {},
): Promise<MicropubDiscovery> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('Micropub discovery requires a fetch implementation');

  const sourceUrl = new URL(pageUrl);
  const response = await fetchImpl(sourceUrl, {
    method: 'GET',
    headers: {
      accept: options.accept ?? 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1',
    },
  });
  if (!response.ok) throw new Error(`Micropub discovery failed with HTTP ${response.status}`);

  const discovered = mergeDiscovery(
    { sourceUrl: sourceUrl.toString() },
    parseEmbeddedMicropubLinks(await response.text(), sourceUrl),
    parseMicropubLinkHeader(response.headers.get('link'), sourceUrl),
  );

  return discovered;
}

export async function queryMicropubConfiguration(
  input: MicropubConfigRequest,
  options: { fetch?: FetchLike } = {},
): Promise<MicropubConfiguration> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('Micropub configuration query requires a fetch implementation');

  const request = buildMicropubConfigQueryRequest(input);
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
  });
  if (!response.ok) throw new Error(`Micropub configuration query failed with HTTP ${response.status}`);

  const raw = await response.json();
  const config = isRecord(raw) ? raw : {};
  const mediaEndpoint = config['media-endpoint'];
  const syndicateTo = config['syndicate-to'];

  return {
    raw: config,
    ...(typeof mediaEndpoint === 'string' ? { mediaEndpoint } : {}),
    ...(syndicateTo !== undefined ? { syndicateTo } : {}),
  };
}

export function buildMicropubConfigQueryRequest(input: MicropubConfigRequest): PreparedMicropubRequest {
  const url = new URL(input.endpointUrl);
  url.searchParams.append('q', 'config');

  return {
    url: url.toString(),
    method: 'GET',
    headers: bearerHeaders(input.accessToken, { accept: 'application/json' }),
  };
}

export function buildMicropubCreateRequest(input: MicropubCreateRequest): PreparedMicropubRequest {
  const format = input.format ?? 'json';
  const type = normalizeType(input.type);
  const properties = normalizeMicropubProperties(input.properties);

  if (format === 'form') {
    const body = new URLSearchParams();
    body.set('h', type[0]?.replace(/^h-/, '') ?? 'entry');
    for (const [name, values] of Object.entries(properties)) {
      for (const value of values) appendFormValue(body, name, value);
    }

    return {
      url: new URL(input.endpointUrl).toString(),
      method: 'POST',
      headers: bearerHeaders(input.accessToken, {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      }),
      body: body.toString(),
    };
  }

  return {
    url: new URL(input.endpointUrl).toString(),
    method: 'POST',
    headers: bearerHeaders(input.accessToken, {
      accept: 'application/json',
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ type, properties }),
  };
}

export function buildMicropubUpdateRequest(input: MicropubUpdateRequest): PreparedMicropubRequest {
  const payload: Record<string, unknown> = {
    action: 'update',
    url: new URL(input.postUrl).toString(),
  };
  if (input.replace) payload.replace = normalizeMicropubProperties(input.replace);
  if (input.add) payload.add = normalizeMicropubProperties(input.add);
  if (input.delete) {
    payload.delete = isStringList(input.delete) ? input.delete : normalizeMicropubProperties(input.delete);
  }

  return {
    url: new URL(input.endpointUrl).toString(),
    method: 'POST',
    headers: bearerHeaders(input.accessToken, {
      accept: 'application/json',
      'content-type': 'application/json',
    }),
    body: JSON.stringify(payload),
  };
}

export function buildMicropubDeleteRequest(input: MicropubDeleteRequest): PreparedMicropubRequest {
  return {
    url: new URL(input.endpointUrl).toString(),
    method: 'POST',
    headers: bearerHeaders(input.accessToken, {
      accept: 'application/json',
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ action: 'delete', url: new URL(input.postUrl).toString() }),
  };
}

export function normalizeMicropubProperties(properties: MicropubProperties): Record<string, MicropubPropertyValue[]> {
  const normalized: Record<string, MicropubPropertyValue[]> = {};
  for (const [name, value] of Object.entries(properties)) {
    normalized[name] = Array.isArray(value) ? [...value] : [value];
  }

  return normalized;
}

export function parseMicropubLinkHeader(
  header: string | null | undefined,
  baseUrl?: string | URL,
): Partial<MicropubDiscovery> {
  if (!header) return {};

  const discovery: Partial<MicropubDiscovery> = {};
  for (const part of splitOutsideQuotes(header, ',')) {
    const match = /^\s*<([^>]+)>/.exec(part);
    if (!match?.[1]) continue;

    const params = parseLinkParameters(part.slice(match[0].length));
    const rel = params.get('rel');
    if (!rel) continue;

    assignRel(discovery, rel, match[1], baseUrl);
  }

  return discovery;
}

export function parseEmbeddedMicropubLinks(html: string, baseUrl?: string | URL): Partial<MicropubDiscovery> {
  const discovery: Partial<MicropubDiscovery> = {};
  const linkPattern = /<(?:link|a)\s+[^>]*>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const element = match[0];
    const attributes = parseHtmlAttributes(element);
    const rel = attributes.get('rel');
    const href = attributes.get('href');
    if (!rel || !href) continue;

    assignRel(discovery, rel, href, baseUrl);
  }

  return discovery;
}

function normalizeType(type: string | readonly string[] | undefined): string[] {
  if (!type) return ['h-entry'];
  return typeof type === 'string' ? [type] : [...type];
}

function isStringList(value: readonly string[] | MicropubProperties): value is readonly string[] {
  return Array.isArray(value);
}

function bearerHeaders(accessToken: string, headers: Record<string, string>): Record<string, string> {
  if (!accessToken.trim()) throw new Error('Micropub requests require a non-empty access token');
  return {
    ...headers,
    authorization: `Bearer ${accessToken}`,
  };
}

function appendFormValue(params: URLSearchParams, name: string, value: MicropubPropertyValue): void {
  if (Array.isArray(value)) {
    for (const item of value) appendFormValue(params, name, item);
    return;
  }
  if (isRecord(value)) {
    throw new Error(`Micropub form-encoded requests only support scalar values for "${name}"`);
  }

  params.append(name, value === null ? '' : String(value));
}

function mergeDiscovery(...parts: Partial<MicropubDiscovery>[]): MicropubDiscovery {
  return Object.assign({}, ...parts) as MicropubDiscovery;
}

function assignRel(
  discovery: Partial<MicropubDiscovery>,
  rel: string,
  href: string,
  baseUrl?: string | URL,
): void {
  const resolved = resolveHref(href, baseUrl);
  if (!resolved) return;

  const rels = rel.split(/\s+/).filter(Boolean);
  if (rels.includes('micropub')) discovery.micropubEndpoint = resolved;
  if (rels.includes('authorization_endpoint')) discovery.authorizationEndpoint = resolved;
  if (rels.includes('token_endpoint')) discovery.tokenEndpoint = resolved;
}

function resolveHref(href: string, baseUrl?: string | URL): string | undefined {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function parseLinkParameters(input: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of splitOutsideQuotes(input, ';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim().toLowerCase();
    const value = unquote(part.slice(separator + 1).trim());
    if (key) params.set(key, value);
  }

  return params;
}

function parseHtmlAttributes(input: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attrPattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of input.matchAll(attrPattern)) {
    const key = match[1]?.toLowerCase();
    if (!key || key === 'link' || key === 'a') continue;

    attributes.set(key, match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function splitOutsideQuotes(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (char === separator && !quoted) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());

  return parts;
}

function unquote(input: string): string {
  if (input.startsWith('"') && input.endsWith('"')) return input.slice(1, -1).replace(/\\"/g, '"');
  return input;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
