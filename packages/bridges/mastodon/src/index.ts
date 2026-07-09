import { defineBridge, type BridgeAttachment, type BridgeMessage, tokenSetup } from '@profullstack/sh1pt-core';

// Mastodon bridge — streaming API for receive (/api/v1/streaming/user),
// /api/v1/statuses for send. "Channels" on Mastodon are hashtag streams
// (public) or specific user DMs. Pair one instance at a time.
interface Config {
  instance?: string;                // e.g. 'mastodon.social'
  apiBase?: string;                 // test override; defaults to https://<instance>
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
  maxChars?: number;                // default Mastodon status limit
}

const DEFAULT_MAX_CHARS = 500;

export default defineBridge<Config>({
  id: 'bridge-mastodon',
  label: 'Mastodon',

  async subscribe(ctx, channels, onMessage, config = {}) {
    const instance = mastodonInstance(config);
    const token = mastodonToken(ctx, instance);
    const tags = channels.map(normalizeMastodonChannel);
    const invalid = tags.find((tag) => !isHashtagChannel(tag));
    if (invalid !== undefined) throw new Error(`Mastodon bridge channel must be a hashtag name, got "${invalid}"`);

    ctx.log(`mastodon bridge · ${instance} · hashtags=${tags.join(',')}`);
    const controller = new AbortController();
    const abort = () => controller.abort();
    ctx.signal?.addEventListener('abort', abort, { once: true });

    const tasks: Promise<void>[] = [];
    await Promise.all(tags.map(async (tag) => {
      const response = await fetch(`${mastodonApiBase(config)}/api/v1/streaming/hashtag?${new URLSearchParams({ tag })}`, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(await readMastodonError(response, token));
      if (!response.body) throw new Error('Mastodon streaming response did not include a body');

      const task = pumpMastodonStream(response.body, tag, onMessage).catch((err: unknown) => {
        if (!controller.signal.aborted) ctx.log(`mastodon bridge stream ${tag} failed: ${errorMessage(err)}`);
      });
      tasks.push(task);
    }));

    return {
      async close() {
        controller.abort();
        ctx.signal?.removeEventListener('abort', abort);
        await Promise.allSettled(tasks);
      },
    };
  },

  async send(ctx, channel, msg, config = {}) {
    const instance = mastodonInstance(config);
    const token = mastodonToken(ctx, instance);
    const status = mastodonStatusPayload(msg, channel, config);
    ctx.log(`mastodon bridge · ${instance} · POST /statuses · ${status.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const data = await mastodonJsonRequest<MastodonStatusResponse>(ctx, config, '/api/v1/statuses', {
      method: 'POST',
      token,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': mastodonIdempotencyKey(msg, channel),
      },
      body: JSON.stringify({
        status,
        visibility: config.visibility ?? 'public',
      }),
    });

    if (!data.id) throw new Error('Mastodon status response did not include a status id');
    return { id: data.id };
  },

  setup: tokenSetup({
    secretKey: 'MASTODON_BRIDGE_ACCESS_TOKEN',
    label: 'Mastodon bridge',
    vendorDocUrl: 'https://docs.joinmastodon.org/client/intro/',
    steps: [
      'Open https://docs.joinmastodon.org/client/intro/',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
});

interface SecretContext {
  secret(k: string): string | undefined;
}

interface MastodonAccount {
  username?: string;
  acct?: string;
  display_name?: string;
  avatar?: string;
  avatar_static?: string;
  bot?: boolean;
}

interface MastodonMediaAttachment {
  type?: string;
  url?: string;
  preview_url?: string;
  remote_url?: string;
  description?: string;
  mime_type?: string;
}

interface MastodonStatus {
  id?: string;
  created_at?: string;
  content?: string;
  spoiler_text?: string;
  url?: string;
  uri?: string;
  in_reply_to_id?: string | null;
  account?: MastodonAccount;
  media_attachments?: MastodonMediaAttachment[];
}

interface MastodonStatusResponse {
  id?: string;
}

interface MastodonSseEvent {
  event: string;
  data: string;
  id?: string;
}

export function mastodonStatusPayload(msg: BridgeMessage, channel: string, config: Config = {}): string {
  const tag = normalizeMastodonChannel(channel);
  const lines = [renderBridgeText(msg), ...attachmentLines(msg.attachments)];
  const body = lines.filter(Boolean).join('\n');
  const withTag = isHashtagChannel(tag) && !hasHashtag(body, tag) ? `${body}\n#${tag}` : body;
  return truncate(withTag, config.maxChars ?? DEFAULT_MAX_CHARS);
}

export function mapMastodonStatus(status: MastodonStatus, channel: string): BridgeMessage | undefined {
  if (!status.id) return undefined;
  const account = status.account ?? {};
  const text = mastodonStatusText(status);

  return {
    id: status.id,
    channel,
    identity: {
      network: 'mastodon',
      username: account.display_name || account.acct || account.username || 'unknown',
      avatarUrl: account.avatar_static ?? account.avatar,
      isBot: account.bot,
    },
    text,
    replyToId: status.in_reply_to_id ?? undefined,
    attachments: (status.media_attachments ?? []).map(mastodonAttachment).filter((a): a is BridgeAttachment => Boolean(a)),
    timestamp: status.created_at ?? new Date(0).toISOString(),
    originalNetwork: 'mastodon',
  };
}

export function normalizeMastodonChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').replace(/^tag:/i, '');
}

export function parseMastodonSseEvent(raw: string): MastodonSseEvent | undefined {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const split = line.indexOf(':');
    const field = split === -1 ? line : line.slice(0, split);
    const value = split === -1 ? '' : line.slice(split + 1).replace(/^ /, '');

    if (field === 'event') event = value || 'message';
    if (field === 'data') data.push(value);
    if (field === 'id') id = value;
  }

  if (!data.length) return undefined;
  return { event, data: data.join('\n'), id };
}

async function pumpMastodonStream(
  body: NonNullable<Response['body']>,
  channel: string,
  onMessage: (msg: BridgeMessage) => Promise<void> | void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const event = parseMastodonSseEvent(part);
      if (event?.event !== 'update') continue;
      const msg = mapMastodonStatus(JSON.parse(event.data) as MastodonStatus, channel);
      if (msg) await onMessage(msg);
    }
  }
}

async function mastodonJsonRequest<T>(
  ctx: SecretContext,
  config: Config,
  path: string,
  options: { method: string; token: string; headers?: Record<string, string>; body?: string },
): Promise<T> {
  const response = await fetch(`${mastodonApiBase(config)}${path}`, {
    method: options.method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${options.token}`,
      ...options.headers,
    },
    body: options.body,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(`Mastodon ${options.method} ${path} failed: ${response.status} ${redact(mastodonErrorMessage(data, response.statusText), options.token)}`);
  }

  return data as T;
}

function mastodonInstance(config: Config): string {
  if (!config.instance) throw new Error('Mastodon bridge config.instance is required');
  return normalizeInstance(config.instance);
}

function normalizeInstance(instance: string): string {
  return instance.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function mastodonApiBase(config: Config): string {
  if (config.apiBase) return config.apiBase.replace(/\/+$/, '');
  return `https://${mastodonInstance(config)}`;
}

function mastodonToken(ctx: SecretContext, instance: string): string {
  const instanceKey = `MASTODON_TOKEN_${instance.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
  const token = ctx.secret('MASTODON_BRIDGE_ACCESS_TOKEN') ?? ctx.secret(instanceKey) ?? ctx.secret('MASTODON_ACCESS_TOKEN');
  if (!token) throw new Error(`MASTODON_BRIDGE_ACCESS_TOKEN, ${instanceKey}, or MASTODON_ACCESS_TOKEN not in vault`);
  return token;
}

function renderBridgeText(msg: BridgeMessage): string {
  const network = msg.originalNetwork ?? msg.identity.network;
  const text = msg.text || '(no text)';
  return `${msg.identity.username || 'unknown'} [${network}]: ${text}`;
}

function attachmentLines(attachments?: BridgeAttachment[]): string[] {
  return (attachments ?? []).map((attachment) => {
    const label = attachment.filename || attachment.kind;
    return `${label}: ${attachment.url}`;
  });
}

function mastodonStatusText(status: MastodonStatus): string {
  const body = htmlToText(status.content ?? '');
  const spoiler = htmlToText(status.spoiler_text ?? '');
  return spoiler ? `CW: ${spoiler}\n${body}` : body;
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity);
}

function mastodonAttachment(media: MastodonMediaAttachment): BridgeAttachment | undefined {
  const url = media.url ?? media.remote_url ?? media.preview_url;
  if (!url) return undefined;
  return {
    url,
    kind: mastodonAttachmentKind(media.type),
    filename: media.description || undefined,
    mimeType: media.mime_type,
  };
}

function mastodonAttachmentKind(type?: string): BridgeAttachment['kind'] {
  if (type === 'image') return 'image';
  if (type === 'video' || type === 'gifv') return 'video';
  if (type === 'audio') return 'audio';
  return 'file';
}

function isHashtagChannel(tag: string): boolean {
  return Boolean(tag) && !tag.includes('/') && !tag.includes('@') && !tag.includes(':');
}

function hasHashtag(text: string, tag: string): boolean {
  return new RegExp(`(^|\\s)#${escapeRegExp(tag)}(\\s|$)`, 'i').test(text);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function mastodonIdempotencyKey(msg: BridgeMessage, channel: string): string {
  return `sh1pt-${hashString(`${channel}:${msg.originalNetwork ?? msg.identity.network}:${msg.id}`)}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function readMastodonError(response: Response, token: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `Mastodon request failed: ${response.status} ${response.statusText}`;
  try {
    return `Mastodon request failed: ${response.status} ${redact(mastodonErrorMessage(JSON.parse(text), response.statusText), token)}`;
  } catch {
    return `Mastodon request failed: ${response.status} ${redact(text, token)}`;
  }
}

function mastodonErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  return fallback;
}

function redact(value: string, token: string): string {
  return token ? value.split(token).join('[redacted]') : value;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
