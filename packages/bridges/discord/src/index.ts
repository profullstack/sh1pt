import { defineBridge, type BridgeAttachment, type BridgeMessage, tokenSetup } from '@profullstack/sh1pt-core';

// Discord bridge — gateway WebSocket for receive, bot API for send.
// Uses a bot user (not a webhook) since only bots can subscribe to live
// message events. Needs MESSAGE CONTENT intent enabled in the app
// settings or reads only content the bot is mentioned in.
interface Config {
  intents?: number;                 // Discord gateway intents bitfield
  applicationId?: string;
  apiBase?: string;
  gatewayUrl?: string;
}

const DEFAULT_API_BASE = 'https://discord.com/api/v10';
const DEFAULT_INTENTS = 1 << 9 | 1 << 15; // GuildMessages + MessageContent.
const MAX_CONTENT = 2000;
const MAX_EMBED_DESCRIPTION = 4096;

export default defineBridge<Config>({
  id: 'bridge-discord',
  label: 'Discord',

  async subscribe(ctx, channels, onMessage, config = {}) {
    const token = discordToken(ctx);
    ctx.log(`discord bridge · subscribing to ${channels.length} channels`);
    const gatewayUrl = config.gatewayUrl ?? await fetchGatewayUrl(ctx, config);
    return openDiscordGateway({
      token,
      url: gatewayUrl,
      channels,
      intents: config.intents ?? DEFAULT_INTENTS,
      onMessage,
      signal: ctx.signal,
    });
  },

  async send(ctx, channel, msg, config = {}): Promise<{ id: string }> {
    discordToken(ctx);
    ctx.log(`discord bridge send → channel=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    const message = await discordRequest<DiscordCreateMessageResponse>(ctx, config, `/channels/${encodeURIComponent(channel)}/messages`, {
      method: 'POST',
      body: discordMessagePayload(msg),
    });
    return { id: message.id };
  },

  setup: tokenSetup({
    secretKey: 'DISCORD_BRIDGE_BOT_TOKEN',
    label: 'Discord bridge',
    vendorDocUrl: 'https://discord.com/developers/applications',
    steps: [
      'Open https://discord.com/developers/applications',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
});

interface SecretContext {
  secret(k: string): string | undefined;
}

interface DiscordGatewayOptions {
  token: string;
  url: string;
  channels: string[];
  intents: number;
  onMessage: (msg: BridgeMessage) => Promise<void> | void;
  signal?: AbortSignal;
}

interface MinimalWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: { data?: unknown }) => void): void;
}

interface DiscordGatewayPacket<T = unknown> {
  op: number;
  d: T;
  s?: number | null;
  t?: string | null;
}

interface DiscordGatewayHello {
  heartbeat_interval: number;
}

interface DiscordUser {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
}

interface DiscordAttachment {
  id?: string;
  url?: string;
  filename?: string;
  content_type?: string;
}

interface DiscordMessageCreate {
  id?: string;
  channel_id?: string;
  content?: string;
  timestamp?: string;
  author?: DiscordUser;
  member?: { nick?: string | null };
  attachments?: DiscordAttachment[];
  message_reference?: { message_id?: string };
  webhook_id?: string;
}

interface DiscordCreateMessageResponse {
  id: string;
}

export function discordMessagePayload(msg: BridgeMessage): Record<string, unknown> {
  const description = truncate(renderBridgeText(msg), MAX_EMBED_DESCRIPTION);
  const content = truncate(renderBridgeContent(msg), MAX_CONTENT);
  const network = msg.originalNetwork ?? msg.identity.network;

  return {
    content,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author: {
          name: `${msg.identity.username || 'unknown'} [${network}]`,
          ...(msg.identity.avatarUrl ? { icon_url: msg.identity.avatarUrl } : {}),
        },
        description,
        timestamp: msg.timestamp,
        ...(msg.attachments?.length ? { fields: attachmentFields(msg.attachments) } : {}),
      },
    ],
  };
}

export function mapDiscordMessage(event: DiscordMessageCreate, channels: Set<string>): BridgeMessage | undefined {
  if (!event.channel_id || !channels.has(event.channel_id) || !event.id) return undefined;
  const author = event.author ?? {};
  const username = event.member?.nick || author.global_name || author.username || (event.webhook_id ? 'webhook' : 'unknown');

  return {
    id: event.id,
    channel: event.channel_id,
    identity: {
      network: 'discord',
      username,
      avatarUrl: discordAvatarUrl(author),
      isBot: author.bot ?? Boolean(event.webhook_id),
    },
    text: event.content ?? '',
    replyToId: event.message_reference?.message_id,
    attachments: (event.attachments ?? []).map(discordAttachment).filter((a): a is BridgeAttachment => Boolean(a)),
    timestamp: event.timestamp ?? new Date(0).toISOString(),
    originalNetwork: 'discord',
  };
}

export function discordIdentifyPayload(token: string, intents = DEFAULT_INTENTS): DiscordGatewayPacket {
  return {
    op: 2,
    d: {
      token,
      intents,
      properties: {
        os: 'sh1pt',
        browser: 'sh1pt',
        device: 'sh1pt',
      },
    },
  };
}

async function fetchGatewayUrl(ctx: SecretContext, config: Config): Promise<string> {
  const response = await discordRequest<{ url: string }>(ctx, config, '/gateway/bot');
  return response.url;
}

function openDiscordGateway(options: DiscordGatewayOptions): Promise<{ close(): Promise<void> }> {
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => MinimalWebSocket }).WebSocket;
  if (!WebSocketCtor) throw new Error('Global WebSocket is not available; use Node 22+ or provide a runtime WebSocket implementation');

  const ws = new WebSocketCtor(`${options.url}?v=10&encoding=json`);
  const channels = new Set(options.channels);
  let sequence: number | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const sendPacket = (packet: DiscordGatewayPacket) => {
    if (closed || ws.readyState !== 1) return;
    ws.send(JSON.stringify(packet));
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    ws.close(1000, 'sh1pt bridge closed');
  };

  options.signal?.addEventListener('abort', () => {
    void close();
  }, { once: true });

  ws.addEventListener('message', (event) => {
    void handleGatewayMessage(event.data, {
      token: options.token,
      intents: options.intents,
      channels,
      sendPacket,
      onMessage: options.onMessage,
      getSequence: () => sequence,
      setSequence: (next) => { sequence = next; },
      setHeartbeat: (intervalMs) => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = setInterval(() => sendPacket({ op: 1, d: sequence }), intervalMs);
      },
    });
  });

  ws.addEventListener('close', () => {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
  });

  return Promise.resolve({ close });
}

async function handleGatewayMessage(
  data: unknown,
  state: {
    token: string;
    intents: number;
    channels: Set<string>;
    sendPacket(packet: DiscordGatewayPacket): void;
    onMessage(msg: BridgeMessage): Promise<void> | void;
    getSequence(): number | null;
    setSequence(next: number | null): void;
    setHeartbeat(intervalMs: number): void;
  },
): Promise<void> {
  const packet = parseGatewayPacket(data);
  if (!packet) return;
  if (typeof packet.s === 'number') state.setSequence(packet.s);

  if (packet.op === 10) {
    const hello = packet.d as DiscordGatewayHello;
    state.setHeartbeat(hello.heartbeat_interval);
    state.sendPacket(discordIdentifyPayload(state.token, state.intents));
    return;
  }

  if (packet.op === 1) {
    state.sendPacket({ op: 1, d: state.getSequence() });
    return;
  }

  if (packet.op === 0 && packet.t === 'MESSAGE_CREATE') {
    const msg = mapDiscordMessage(packet.d as DiscordMessageCreate, state.channels);
    if (msg) await state.onMessage(msg);
  }
}

function parseGatewayPacket(data: unknown): DiscordGatewayPacket | undefined {
  const text = typeof data === 'string' ? data : data instanceof Uint8Array ? new TextDecoder().decode(data) : undefined;
  if (!text) return undefined;
  try {
    return JSON.parse(text) as DiscordGatewayPacket;
  } catch {
    return undefined;
  }
}

async function discordRequest<T = unknown>(
  ctx: SecretContext,
  config: Config,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = discordToken(ctx);
  const response = await fetch(`${apiBase(config)}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(`Discord ${options.method ?? 'GET'} ${path} failed: ${response.status} ${redact(discordErrorMessage(data, response.statusText), token)}`);
  }

  return data as T;
}

function discordToken(ctx: SecretContext): string {
  const token = ctx.secret('DISCORD_BRIDGE_BOT_TOKEN') ?? ctx.secret('DISCORD_BOT_TOKEN');
  if (!token) throw new Error('DISCORD_BRIDGE_BOT_TOKEN or DISCORD_BOT_TOKEN not in vault');
  return token;
}

function apiBase(config: Config): string {
  return (config.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
}

function renderBridgeContent(msg: BridgeMessage): string {
  const lines = [renderBridgeText(msg), ...attachmentLines(msg.attachments)];
  return lines.filter(Boolean).join('\n');
}

function renderBridgeText(msg: BridgeMessage): string {
  const network = msg.originalNetwork ?? msg.identity.network;
  const text = sanitizeMentions(msg.text || '(no text)');
  return `${msg.identity.username || 'unknown'} [${network}]: ${text}`;
}

function attachmentLines(attachments?: BridgeAttachment[]): string[] {
  return (attachments ?? []).map((attachment) => {
    const label = attachment.filename || attachment.kind;
    return `${label}: ${attachment.url}`;
  });
}

function attachmentFields(attachments: BridgeAttachment[]): { name: string; value: string }[] {
  return attachments.slice(0, 10).map((attachment) => ({
    name: attachment.filename || attachment.kind,
    value: truncate(attachment.url, 1024),
  }));
}

function sanitizeMentions(text: string): string {
  return text.replace(/@everyone/g, '@ everyone').replace(/@here/g, '@ here');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function discordAttachment(attachment: DiscordAttachment): BridgeAttachment | undefined {
  if (!attachment.url) return undefined;
  return {
    url: attachment.url,
    kind: attachmentKind(attachment.content_type),
    filename: attachment.filename,
    mimeType: attachment.content_type,
  };
}

function attachmentKind(contentType?: string): BridgeAttachment['kind'] {
  if (contentType?.startsWith('image/')) return 'image';
  if (contentType?.startsWith('video/')) return 'video';
  if (contentType?.startsWith('audio/')) return 'audio';
  return 'file';
}

function discordAvatarUrl(user: DiscordUser): string | undefined {
  if (!user.id || !user.avatar) return undefined;
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
}

function discordErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message;
  }
  if (typeof data === 'object' && data && 'errors' in data) return JSON.stringify((data as { errors: unknown }).errors);
  return fallback;
}

function redact(value: string, token: string): string {
  return token ? value.split(token).join('[redacted]') : value;
}
