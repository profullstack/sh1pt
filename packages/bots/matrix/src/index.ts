import { defineBot, tokenSetup, type BotCtx, type BotEvent, type BotHandler, type BotReply } from '@profullstack/sh1pt-core';

// Matrix bot — sync loop against homeserver. Access token via MATRIX_ACCESS_TOKEN
// (obtain via /login). E2EE rooms need an Olm/Megolm-capable client;
// default to unencrypted rooms until crypto is wired.
interface Config {
  homeserver?: string;
  accessToken?: string;
  userId?: string;
  commandPrefix?: string;
  initialSince?: string;
  syncTimeoutMs?: number;
  pollIntervalMs?: number;
  transactionIdPrefix?: string;
  ignoreOwnMessages?: boolean;
}

interface MatrixEvent {
  event_id?: string;
  sender?: string;
  type?: string;
  origin_server_ts?: number;
  content?: {
    body?: unknown;
    msgtype?: string;
    [key: string]: unknown;
  };
}

interface MatrixSyncResponse {
  next_batch?: string;
  rooms?: {
    join?: Record<string, {
      timeline?: {
        events?: MatrixEvent[];
      };
    }>;
  };
}

const DEFAULT_HOMESERVER = 'https://matrix.org';
const DEFAULT_COMMAND_PREFIX = '!';
const DEFAULT_SYNC_TIMEOUT_MS = 30_000;

class MatrixClient {
  private readonly homeserver: string;
  private readonly accessToken: string;
  private since?: string;
  private closed = false;
  private loop?: Promise<void>;
  private readonly controller = new AbortController();

  constructor(
    private readonly ctx: BotCtx,
    private readonly config: Required<Pick<Config, 'accessToken'>> & Config,
  ) {
    this.homeserver = normalizeHomeserver(config.homeserver);
    this.accessToken = config.accessToken;
    this.since = config.initialSince;
  }

  start(handlers: BotHandler[]): void {
    this.loop = this.syncLoop(handlers).catch((err) => {
      if (!this.closed) this.ctx.log(`bot-matrix sync stopped: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.controller.abort();
    await this.loop?.catch(() => {});
  }

  async send(channel: string, reply: BotReply): Promise<{ id: string }> {
    const text = reply.text?.trim();
    if (!text) return { id: 'empty' };
    const txnId = `${this.config.transactionIdPrefix ?? 'sh1pt'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const response = await this.request<{ event_id?: string }>(
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(channel)}/send/m.room.message/${encodeURIComponent(txnId)}`,
      { msgtype: 'm.text', body: text },
    );
    return { id: response.event_id ?? txnId };
  }

  private async syncLoop(handlers: BotHandler[]): Promise<void> {
    while (!this.closed) {
      const response = await this.sync();
      this.since = response.next_batch ?? this.since;
      await this.dispatch(response, handlers);
      const waitMs = this.config.pollIntervalMs ?? 0;
      if (waitMs > 0) await sleep(waitMs, this.controller.signal);
    }
  }

  private async sync(): Promise<MatrixSyncResponse> {
    const params = new URLSearchParams({
      timeout: String(this.config.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS),
    });
    if (this.since) params.set('since', this.since);
    return this.request<MatrixSyncResponse>('GET', `/_matrix/client/v3/sync?${params.toString()}`);
  }

  private async dispatch(response: MatrixSyncResponse, handlers: BotHandler[]): Promise<void> {
    const joinedRooms = response.rooms?.join ?? {};
    for (const [roomId, room] of Object.entries(joinedRooms)) {
      for (const event of room.timeline?.events ?? []) {
        const botEvent = toBotEvent(roomId, event, this.config);
        if (!botEvent) continue;
        if ((this.config.ignoreOwnMessages ?? true) && this.config.userId && event.sender === this.config.userId) continue;
        for (const handler of handlers) {
          const reply = await handler.handle(this.ctx, botEvent);
          if (reply?.text) await this.send(roomId, reply);
        }
      }
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${this.homeserver}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: this.controller.signal,
    });
    const text = await response.text();
    const data = parseJson(text);
    if (!response.ok) {
      const message = errorMessage(data, text, response.statusText);
      throw new Error(`Matrix ${method} ${path.split('?')[0]} failed: ${response.status} ${redact(message, this.accessToken)}`);
    }
    return data as T;
  }
}

function resolveConfig(ctx: { secret(k: string): string | undefined }, config: Config): Config {
  return {
    ...config,
    accessToken: config.accessToken ?? ctx.secret('MATRIX_ACCESS_TOKEN') ?? ctx.secret('MATRIX_TOKEN'),
  };
}

function toBotEvent(roomId: string, event: MatrixEvent, config: Config): BotEvent | undefined {
  if (event.type !== 'm.room.message') return undefined;
  const msgtype = event.content?.msgtype;
  if (msgtype && msgtype !== 'm.text' && msgtype !== 'm.notice') return undefined;
  const text = typeof event.content?.body === 'string' ? event.content.body : '';
  if (!text) return undefined;
  const commandPrefix = config.commandPrefix ?? DEFAULT_COMMAND_PREFIX;
  const isCommand = text.startsWith(commandPrefix) && text.length > commandPrefix.length;
  const [command, ...args] = isCommand ? text.slice(commandPrefix.length).trim().split(/\s+/) : [];
  return {
    type: isCommand ? 'command' : 'message',
    channel: roomId,
    user: {
      id: event.sender ?? 'unknown',
      username: event.sender,
      isBot: config.userId ? event.sender === config.userId : undefined,
    },
    text,
    command,
    args: isCommand ? args : undefined,
    timestamp: new Date(event.origin_server_ts ?? Date.now()).toISOString(),
    raw: event,
  };
}

function normalizeHomeserver(homeserver = DEFAULT_HOMESERVER): string {
  return homeserver.replace(/\/+$/, '');
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function redact(value: string, token: string): string {
  return value.split(token).join('[redacted]');
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function errorMessage(data: unknown, text: string, fallback: string): string {
  if (typeof data === 'object' && data && 'error' in data && typeof data.error === 'string') {
    return data.error;
  }
  return text || fallback;
}

export default defineBot<Config>({
  id: 'bot-matrix',
  label: 'Matrix',
  supports: ['message', 'command', 'reaction', 'join', 'leave'],

  async register(ctx, handlers, config) {
    const resolved = resolveConfig(ctx, config);
    if (!resolved.accessToken) throw new Error('MATRIX_ACCESS_TOKEN not in vault');
    ctx.log(`bot-matrix · register ${handlers.length} handlers (hs=${resolved.homeserver ?? 'matrix.org'})`);
    if (ctx.dryRun) return { async close() {} };
    const client = new MatrixClient(ctx, resolved as Required<Pick<Config, 'accessToken'>> & Config);
    client.start(handlers);
    return { close: () => client.close() };
  },

  async send(ctx, channel, reply, config) {
    const resolved = resolveConfig(ctx, config);
    if (!resolved.accessToken) throw new Error('MATRIX_ACCESS_TOKEN not in vault');
    ctx.log(`bot-matrix · send → room=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    const client = new MatrixClient(ctx, resolved as Required<Pick<Config, 'accessToken'>> & Config);
    return client.send(channel, reply);
  },

  setup: tokenSetup({
    secretKey: 'MATRIX_ACCESS_TOKEN',
    label: 'Matrix bot',
    vendorDocUrl: 'https://matrix.org/docs/guides/client-server-api',
    steps: [
      'Open https://matrix.org/docs/guides/client-server-api',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
});
