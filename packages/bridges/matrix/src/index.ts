import { defineBridge, type BridgeAttachment, type BridgeMessage, tokenSetup } from '@profullstack/sh1pt-core';

// Matrix bridge: receive through the Client-Server /sync API and send
// relayed messages as m.room.message events.
export interface MatrixBridgeConfig {
  homeserver: string;
  userId: string;
  accessTokenSecret?: string;
  appservice?: {
    id: string;
    namespacePrefix: string;
    tokenSecret?: string;
  };
  since?: string;
  deliverInitial?: boolean;
  syncTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface MatrixTextContent {
  msgtype: 'm.text';
  body: string;
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
}

interface MatrixSendResponse {
  event_id?: string;
}

interface MatrixErrorResponse {
  errcode?: string;
  error?: string;
}

interface MatrixSyncResponse {
  next_batch?: string;
  rooms?: {
    join?: Record<string, MatrixJoinedRoom>;
  };
}

interface MatrixJoinedRoom {
  timeline?: {
    events?: MatrixTimelineEvent[];
  };
}

interface MatrixTimelineEvent {
  content?: Record<string, unknown>;
  event_id?: string;
  origin_server_ts?: number;
  room_id?: string;
  sender?: string;
  type?: string;
}

const DEFAULT_TOKEN_SECRET = 'MATRIX_BRIDGE_ACCESS_TOKEN';
const DEFAULT_APPSERVICE_TOKEN_SECRET = 'MATRIX_APP_SERVICE_TOKEN';
const DEFAULT_SYNC_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MATRIX_HTML_FORMAT = 'org.matrix.custom.html';

const attachmentKindsByMsgType: Record<string, BridgeAttachment['kind']> = {
  'm.audio': 'audio',
  'm.file': 'file',
  'm.image': 'image',
  'm.video': 'video',
};

export function matrixTokenSecret(config: MatrixBridgeConfig): string {
  return config.appservice?.tokenSecret ?? (config.appservice ? DEFAULT_APPSERVICE_TOKEN_SECRET : config.accessTokenSecret ?? DEFAULT_TOKEN_SECRET);
}

export function normalizeHomeserver(homeserver: string): string {
  const trimmed = homeserver.trim().replace(/\/+$/, '');
  const url = new URL(trimmed);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Matrix homeserver must be an http(s) URL');
  }
  return url.toString().replace(/\/+$/, '');
}

export function matrixApiUrl(config: MatrixBridgeConfig, path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, normalizeHomeserver(config.homeserver));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

export function renderMatrixTextContent(msg: BridgeMessage): MatrixTextContent {
  const network = msg.originalNetwork ?? msg.identity.network;
  const prefix = `${msg.identity.username} [${network}]`;
  const bodyLines = [`${prefix}: ${msg.text || '(no text)'}`];

  for (const attachment of msg.attachments ?? []) {
    bodyLines.push(`${attachment.filename ?? attachment.kind}: ${attachment.url}`);
  }

  const body = bodyLines.join('\n');
  const formattedLines = [
    `<strong>${escapeHtml(msg.identity.username)}</strong> <em>[${escapeHtml(network)}]</em>: ${escapeHtml(msg.text || '(no text)')}`,
    ...(msg.attachments ?? []).map((attachment) => {
      const label = escapeHtml(attachment.filename ?? attachment.kind);
      const href = escapeHtml(attachment.url);
      return `<a href="${href}">${label}</a>`;
    }),
  ];

  return {
    msgtype: 'm.text',
    body,
    format: MATRIX_HTML_FORMAT,
    formatted_body: formattedLines.join('<br>'),
  };
}

export function matrixTransactionId(msg: BridgeMessage): string {
  const network = msg.originalNetwork ?? msg.identity.network;
  return `sh1pt-${safeTxnPart(network)}-${safeTxnPart(msg.id)}`.slice(0, 255);
}

export function matrixUserIdForIdentity(msg: BridgeMessage, config: MatrixBridgeConfig): string | undefined {
  if (!config.appservice) return undefined;

  const server = config.userId.split(':')[1];
  if (!server) return undefined;

  const prefix = config.appservice.namespacePrefix.startsWith('@') ? config.appservice.namespacePrefix : `@${config.appservice.namespacePrefix}`;
  const network = safeLocalpart(msg.originalNetwork ?? msg.identity.network);
  const username = safeLocalpart(msg.identity.username);
  return `${prefix}${network}_${username}:${server}`;
}

export function mapMatrixEvent(event: MatrixTimelineEvent, roomId: string, config: MatrixBridgeConfig): BridgeMessage | undefined {
  if (event.type !== 'm.room.message') return undefined;
  if (!event.event_id || !event.sender) return undefined;
  if (event.sender === config.userId) return undefined;
  if (isAppserviceEcho(event.sender, config)) return undefined;

  const content = event.content ?? {};
  const body = typeof content.body === 'string' ? content.body : '';
  const msgtype = typeof content.msgtype === 'string' ? content.msgtype : undefined;
  const attachment = attachmentFromContent(content, msgtype);

  if (!body && !attachment) return undefined;

  return {
    id: event.event_id,
    channel: event.room_id ?? roomId,
    identity: {
      network: 'matrix',
      username: displayNameFromUserId(event.sender),
    },
    text: body,
    attachments: attachment ? [attachment] : undefined,
    timestamp: timestampFromMatrix(event.origin_server_ts),
    originalNetwork: 'matrix',
  };
}

export function messagesFromSync(response: MatrixSyncResponse, channels: string[], config: MatrixBridgeConfig): BridgeMessage[] {
  const subscribed = new Set(channels);
  const rooms = response.rooms?.join ?? {};
  const messages: BridgeMessage[] = [];

  for (const [roomId, room] of Object.entries(rooms)) {
    if (subscribed.size > 0 && !subscribed.has(roomId)) continue;

    for (const event of room.timeline?.events ?? []) {
      const message = mapMatrixEvent(event, roomId, config);
      if (message) messages.push(message);
    }
  }

  return messages;
}

async function matrixRequest<T>(
  token: string,
  config: MatrixBridgeConfig,
  path: string,
  init: RequestInit = {},
  query: Record<string, string | undefined> = {},
): Promise<T> {
  const url = matrixApiUrl(config, path, query);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await matrixErrorMessage(response, token));
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

async function matrixErrorMessage(response: Response, token: string): Promise<string> {
  let body: MatrixErrorResponse | undefined;
  try {
    body = (await response.json()) as MatrixErrorResponse;
  } catch {
    body = undefined;
  }

  const code = body?.errcode ? ` ${body.errcode}` : '';
  const detail = body?.error ? `: ${redactSecret(body.error, token)}` : '';
  return `Matrix request failed (${response.status}${code})${detail}`;
}

function requireToken(ctx: { secret(k: string): string | undefined }, config: MatrixBridgeConfig): string {
  const key = matrixTokenSecret(config);
  const token = ctx.secret(key);
  if (!token) throw new Error(`${key} not in vault`);
  return token;
}

async function syncOnce(
  token: string,
  config: MatrixBridgeConfig,
  channels: string[],
  since: string | undefined,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ messages: BridgeMessage[]; since: string | undefined }> {
  const query: Record<string, string | undefined> = {
    filter: JSON.stringify({
      room: {
        timeline: {
          limit: 50,
          types: ['m.room.message'],
        },
      },
    }),
    set_presence: 'offline',
    since,
    timeout: String(timeoutMs),
  };

  const response = await matrixRequest<MatrixSyncResponse>(token, config, '/_matrix/client/v3/sync', { signal }, query);
  return {
    messages: messagesFromSync(response, channels, config),
    since: response.next_batch ?? since,
  };
}

function linkAbortSignal(parent: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (!parent) return controller;

  if (parent.aborted) {
    controller.abort(parent.reason);
  } else {
    parent.addEventListener('abort', () => controller.abort(parent.reason), { once: true });
  }

  return controller;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function attachmentFromContent(content: Record<string, unknown>, msgtype: string | undefined): BridgeAttachment | undefined {
  if (!msgtype) return undefined;
  const kind = attachmentKindsByMsgType[msgtype];
  const url = typeof content.url === 'string' ? content.url : undefined;
  if (!kind || !url) return undefined;

  const body = typeof content.body === 'string' ? content.body : undefined;
  const mimeType = typeof content.info === 'object' && content.info && 'mimetype' in content.info
    ? (content.info as { mimetype?: unknown }).mimetype
    : undefined;

  return {
    url,
    kind,
    filename: body,
    mimeType: typeof mimeType === 'string' ? mimeType : undefined,
  };
}

function displayNameFromUserId(userId: string): string {
  const localpart = userId.startsWith('@') ? userId.slice(1).split(':')[0] : userId.split(':')[0];
  return localpart || userId;
}

function isAppserviceEcho(sender: string, config: MatrixBridgeConfig): boolean {
  const prefix = config.appservice?.namespacePrefix;
  if (!prefix) return false;
  const normalizedPrefix = prefix.startsWith('@') ? prefix : `@${prefix}`;
  return sender.startsWith(normalizedPrefix);
}

function timestampFromMatrix(originServerTs: number | undefined): string {
  const date = typeof originServerTs === 'number' ? new Date(originServerTs) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function safeTxnPart(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._~-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'message';
}

function safeLocalpart(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9._=-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'user';
}

function redactSecret(value: string, secret: string): string {
  return secret ? value.split(secret).join('[redacted]') : value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default defineBridge<MatrixBridgeConfig>({
  id: 'bridge-matrix',
  label: 'Matrix',

  async subscribe(ctx, channels, onMessage, config) {
    const token = requireToken(ctx, config);
    const controller = linkAbortSignal(ctx.signal);
    const timeoutMs = config.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
    const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    let since = config.since;
    let closed = false;

    ctx.log(`matrix bridge · ${normalizeHomeserver(config.homeserver)} · rooms=${channels.length}`);

    const loop = (async () => {
      if (!config.deliverInitial && !since) {
        try {
          const initial = await syncOnce(token, config, channels, since, 0, controller.signal);
          since = initial.since;
        } catch (error) {
          if (!closed && !controller.signal.aborted) {
            ctx.log(`matrix bridge initial sync failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      while (!closed && !controller.signal.aborted) {
        try {
          const result = await syncOnce(token, config, channels, since, timeoutMs, controller.signal);
          since = result.since;
          for (const message of result.messages) {
            await onMessage(message);
          }
        } catch (error) {
          if (!closed && !controller.signal.aborted) {
            ctx.log(`matrix bridge sync failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        await sleep(pollIntervalMs, controller.signal);
      }
    })();

    return {
      async close() {
        closed = true;
        controller.abort();
        await loop.catch(() => undefined);
      },
    };
  },

  async send(ctx, channel, msg, config): Promise<{ id: string }> {
    const token = requireToken(ctx, config);
    ctx.log(`matrix bridge · m.room.message -> ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const txnId = matrixTransactionId(msg);
    const asUserId = matrixUserIdForIdentity(msg, config);
    const path = `/_matrix/client/v3/rooms/${encodeURIComponent(channel)}/send/m.room.message/${encodeURIComponent(txnId)}`;
    const response = await matrixRequest<MatrixSendResponse>(token, config, path, {
      body: JSON.stringify(renderMatrixTextContent(msg)),
      method: 'PUT',
    }, asUserId ? { user_id: asUserId } : {});

    if (!response.event_id) {
      throw new Error('Matrix send did not return an event_id');
    }

    return { id: response.event_id };
  },

  setup: tokenSetup({
    secretKey: DEFAULT_TOKEN_SECRET,
    label: 'Matrix bridge',
    vendorDocUrl: 'https://spec.matrix.org/latest/client-server-api/',
    steps: [
      'Open the Matrix client settings for the bot account',
      `Create or copy an access token and store it as ${DEFAULT_TOKEN_SECRET}`,
      'Invite the bot account to each room that sh1pt should bridge',
    ],
  }),
});
