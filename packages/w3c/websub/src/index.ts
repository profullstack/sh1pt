import { createHmac, timingSafeEqual } from 'node:crypto';
import { defineW3cNamespace, manualSetup, type W3cEndpoint } from '@profullstack/sh1pt-core';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface WebSubDiscovery {
  sourceUrl: string;
  topicUrl?: string;
  hubs: string[];
}

export interface WebSubDiscoveryConfig {
  topicUrl?: string;
  fetch?: FetchLike;
  accept?: string;
  htmlHeadOnly?: boolean;
}

export interface WebSubSubscriptionRequest {
  hubUrl: string;
  callbackUrl: string;
  topicUrl: string;
  mode: 'subscribe' | 'unsubscribe';
  leaseSeconds?: number;
  secret?: string;
  extraParams?: Record<string, string | number | boolean | undefined>;
}

export interface WebSubBuiltRequest {
  url: string;
  method: 'POST';
  headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' };
  body: string;
}

export interface WebSubIntentVerification {
  mode: 'subscribe' | 'unsubscribe';
  topic: string;
  challenge: string;
  leaseSeconds?: number;
}

const SUPPORTED_SIGNATURE_ALGORITHMS = new Set(['sha1', 'sha256', 'sha384', 'sha512']);

export default defineW3cNamespace<WebSubDiscoveryConfig>({
  id: 'w3c-websub',
  label: 'WebSub',
  specUrl: 'https://www.w3.org/TR/websub/',
  namespace: 'websub',
  capabilities: ['discover', 'subscribe', 'notify', 'verify'],
  endpoints: [
    { id: 'topic-discovery', label: 'Topic discovery', method: 'GET', rel: 'self' },
    { id: 'hub-discovery', label: 'Hub discovery', method: 'GET', rel: 'hub' },
    { id: 'subscribe', label: 'Subscription request', method: 'POST' },
    { id: 'callback-verification', label: 'Subscriber callback verification', method: 'GET' },
    { id: 'content-distribution', label: 'Content distribution', method: 'POST' },
  ],

  async discover(ctx, config) {
    if (!config.topicUrl) return Array.from(this.endpoints);

    const discovery = await discoverWebSub(config.topicUrl, config);
    ctx.log(`websub discovery · hubs=${discovery.hubs.length} · topic=${discovery.topicUrl ?? 'none'}`);

    return [
      discovery.topicUrl
        ? { id: 'topic-discovery', label: 'Discovered topic URL', method: 'GET', rel: 'self', pathHint: discovery.topicUrl }
        : undefined,
      ...discovery.hubs.map((hub, index) => ({
        id: `hub-discovery-${index + 1}`,
        label: 'Discovered hub URL',
        method: 'POST' as const,
        rel: 'hub',
        pathHint: hub,
      })),
    ].filter(Boolean) as W3cEndpoint[];
  },

  setup: manualSetup({
    label: 'WebSub',
    vendorDocUrl: 'https://www.w3.org/TR/websub/',
    steps: [
      'Expose an HTTPS callback URL that can echo hub.challenge for verification requests',
      'Discover the topic self URL and hub URL with the w3c-websub discovery helper',
      'Send a subscribe request to the hub with a unique callback URL and optional hub.secret',
      'Verify X-Hub-Signature on incoming distribution POSTs when a secret was used',
    ],
  }),
});

export async function discoverWebSub(topicUrl: string, options: Omit<WebSubDiscoveryConfig, 'topicUrl'> = {}): Promise<WebSubDiscovery> {
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(topicUrl, {
    method: 'GET',
    headers: {
      accept: options.accept ?? 'application/atom+xml, application/rss+xml, text/html;q=0.9, */*;q=0.1',
    },
  });

  if (!response.ok) {
    throw new Error(`WebSub discovery failed for ${topicUrl}: HTTP ${response.status}`);
  }

  const sourceUrl = response.url || topicUrl;
  const linkHeader = response.headers.get('link');
  const headerLinks = parseLinkHeader(linkHeader, sourceUrl);
  if (headerLinks.hubs.length || headerLinks.topicUrl) {
    return headerLinks;
  }

  const text = await response.text();
  return parseEmbeddedWebSubLinks(text, sourceUrl, { headOnly: options.htmlHeadOnly ?? true });
}

export function parseLinkHeader(header: string | null | undefined, sourceUrl = ''): WebSubDiscovery {
  const links = splitLinkHeader(header ?? '').map((part) => parseLinkValue(part, sourceUrl)).filter(Boolean) as Array<{
    href: string;
    rels: string[];
  }>;

  return discoveryFromLinks(sourceUrl, links);
}

export function parseEmbeddedWebSubLinks(
  body: string,
  sourceUrl = '',
  options: { headOnly?: boolean } = {},
): WebSubDiscovery {
  const searchBody = options.headOnly === false ? body : body.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? body;
  const links: Array<{ href: string; rels: string[] }> = [];
  const linkPattern = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(searchBody))) {
    const tag = match[0] ?? '';
    const href = attr(tag, 'href');
    const rel = attr(tag, 'rel');
    if (!href || !rel) continue;
    links.push({
      href: absolutize(href, sourceUrl),
      rels: rel.toLowerCase().split(/\s+/).filter(Boolean),
    });
  }

  return discoveryFromLinks(sourceUrl, links);
}

export function buildSubscriptionRequest(request: WebSubSubscriptionRequest): WebSubBuiltRequest {
  if (!request.callbackUrl) throw new Error('hub.callback is required');
  if (!request.topicUrl) throw new Error('hub.topic is required');
  if (!request.hubUrl) throw new Error('hub URL is required');
  if (request.secret && Buffer.byteLength(request.secret, 'utf8') >= 200) {
    throw new Error('hub.secret must be less than 200 bytes');
  }

  const body = new URLSearchParams({
    'hub.callback': request.callbackUrl,
    'hub.mode': request.mode,
    'hub.topic': request.topicUrl,
  });

  if (request.leaseSeconds !== undefined) body.set('hub.lease_seconds', String(request.leaseSeconds));
  if (request.secret) body.set('hub.secret', request.secret);
  for (const [key, value] of Object.entries(request.extraParams ?? {})) {
    if (value !== undefined) body.set(key, String(value));
  }

  return {
    url: request.hubUrl,
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString(),
  };
}

export function verifyIntentRequest(
  query: URLSearchParams | Record<string, string | undefined>,
  expectedTopicUrl?: string,
): WebSubIntentVerification {
  const mode = valueOf(query, 'hub.mode');
  const topic = valueOf(query, 'hub.topic');
  const challenge = valueOf(query, 'hub.challenge');
  const lease = valueOf(query, 'hub.lease_seconds');

  if (mode !== 'subscribe' && mode !== 'unsubscribe') throw new Error('invalid hub.mode');
  if (!topic) throw new Error('missing hub.topic');
  if (!challenge) throw new Error('missing hub.challenge');
  if (expectedTopicUrl && topic !== expectedTopicUrl) throw new Error('hub.topic does not match expected topic');

  return {
    mode,
    topic,
    challenge,
    leaseSeconds: lease ? Number.parseInt(lease, 10) : undefined,
  };
}

export function verifyDistributionSignature(input: {
  body: string | Buffer | Uint8Array;
  secret: string;
  signatureHeader?: string | null;
}): boolean {
  if (!input.signatureHeader) return false;
  const [algorithm, signature] = input.signatureHeader.split('=', 2);
  if (!algorithm || !signature || !SUPPORTED_SIGNATURE_ALGORITHMS.has(algorithm)) return false;

  const expected = createHmac(algorithm, input.secret).update(input.body).digest('hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  const actualBytes = Buffer.from(signature, 'hex');
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function discoveryFromLinks(sourceUrl: string, links: Array<{ href: string; rels: string[] }>): WebSubDiscovery {
  const hubs = unique(links.filter((link) => link.rels.includes('hub')).map((link) => link.href));
  const topicUrl = links.find((link) => link.rels.includes('self'))?.href;
  return { sourceUrl, topicUrl, hubs };
}

function splitLinkHeader(header: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of header) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseLinkValue(value: string, sourceUrl: string): { href: string; rels: string[] } | undefined {
  const href = value.match(/^\s*<([^>]+)>/)?.[1];
  const rel = value.match(/;\s*rel=(?:"([^"]+)"|([^;\s,]+))/i);
  const relValue = rel?.[1] ?? rel?.[2];
  if (!href || !relValue) return undefined;

  return {
    href: absolutize(href, sourceUrl),
    rels: relValue.toLowerCase().split(/\s+/).filter(Boolean),
  };
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function absolutize(value: string, baseUrl: string): string {
  if (!baseUrl) return value;
  return new URL(value, baseUrl).toString();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function valueOf(params: URLSearchParams | Record<string, string | undefined>, key: string): string | undefined {
  return params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key];
}
