import { defineBridge, type BridgeAttachment, type BridgeMessage, tokenSetup } from '@profullstack/sh1pt-core';

// Slack bridge — Socket Mode for receive (no public HTTP endpoint
// required), chat.postMessage for send. Bot needs channels:history,
// channels:read, chat:write, app_mentions:read scopes + Socket Mode
// enabled on the app.
interface Config {
  appId?: string;
}

export default defineBridge<Config>({
  id: 'bridge-slack',
  label: 'Slack',

  async subscribe(ctx, channels, onMessage) {
    const appToken = ctx.secret('SLACK_APP_TOKEN');
    const botToken = ctx.secret('SLACK_BOT_TOKEN');
    if (!appToken || !botToken) {
      throw new Error('SLACK_APP_TOKEN + SLACK_BOT_TOKEN required in vault (Socket Mode)');
    }
    ctx.log(`slack bridge · subscribing via Socket Mode to ${channels.length} channels`);
    const connection = await slackPost<{ url: string }>('apps.connections.open', appToken, {});
    const WebSocketCtor = websocketConstructor();
    const socket = new WebSocketCtor(connection.url);
    const subscribed = new Set(channels);

    socket.onmessage = async (event) => {
      const envelope = parseJson<SlackEnvelope>(String(event.data));
      if (!envelope) return;
      if (envelope.envelope_id) socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
      if (envelope.type !== 'events_api' || envelope.payload?.event?.type !== 'message') return;
      const slackMessage = envelope.payload.event;
      if (!subscribed.has(slackMessage.channel) || slackMessage.subtype === 'message_deleted') return;
      await onMessage(toBridgeMessage(slackMessage));
    };

    const abort = () => socket.close();
    ctx.signal?.addEventListener('abort', abort, { once: true });
    return {
      async close() {
        ctx.signal?.removeEventListener('abort', abort);
        socket.close();
      },
    };
  },

  async send(ctx, channel, msg) {
    const botToken = ctx.secret('SLACK_BOT_TOKEN');
    if (!botToken) throw new Error('SLACK_BOT_TOKEN not in vault');
    ctx.log(`slack bridge send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    const response = await slackPost<{ ts?: string }>('chat.postMessage', botToken, {
      channel,
      text: renderMessage(msg),
      username: renderUsername(msg),
      icon_url: msg.identity.avatarUrl,
      unfurl_links: false,
      unfurl_media: false,
    });
    return { id: response.ts ?? `slack_${Date.now()}` };
  },

  setup: tokenSetup({
    secretKey: 'SLACK_BOT_TOKEN',
    label: 'Slack bridge bot',
    vendorDocUrl: 'https://api.slack.com/apps',
    steps: [
      'Open https://api.slack.com/apps',
      'Create a Slack app with Socket Mode enabled',
      'Add channels:history, channels:read, chat:write, app_mentions:read scopes',
      'Install the app and copy the bot token',
      'Create an app-level token with connections:write for Socket Mode',
    ],
    fields: [
      {
        key: 'SLACK_APP_TOKEN',
        message: 'Paste the Slack app-level token for Socket Mode:',
        secret: true,
        required: true,
      },
    ],
  }),
});

interface SlackEnvelope {
  envelope_id?: string;
  type?: string;
  payload?: {
    event?: SlackMessageEvent;
  };
}

interface SlackMessageEvent {
  bot_id?: string;
  bot_profile?: {
    name?: string;
    icons?: {
      image_72?: string;
    };
  };
  channel: string;
  event_ts?: string;
  files?: SlackFile[];
  subtype?: string;
  text?: string;
  ts: string;
  type: 'message';
  user?: string;
  username?: string;
}

interface SlackFile {
  filetype?: string;
  mimetype?: string;
  name?: string;
  url_private?: string;
}

interface SlackSocket {
  close(): void;
  onmessage?: (event: { data: string }) => void | Promise<void>;
  send(data: string): void;
}

interface SlackWebSocketConstructor {
  new(url: string): SlackSocket;
}

async function slackPost<T>(method: string, token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = parseJson<Record<string, unknown>>(text) ?? {};
  if (!res.ok || data.ok === false) {
    const reason = typeof data.error === 'string' ? data.error : text;
    throw new Error(`Slack ${method} failed: ${redact(reason, token)}`);
  }
  return data as T;
}

function toBridgeMessage(event: SlackMessageEvent): BridgeMessage {
  return {
    id: event.ts,
    channel: event.channel,
    identity: {
      network: 'slack',
      username: event.username ?? event.bot_profile?.name ?? event.user ?? event.bot_id ?? 'unknown',
      avatarUrl: event.bot_profile?.icons?.image_72,
      isBot: Boolean(event.bot_id),
    },
    text: event.text ?? '',
    attachments: event.files?.map(toAttachment).filter(isAttachment),
    timestamp: slackTimestamp(event.event_ts ?? event.ts),
    originalNetwork: 'slack',
  };
}

function toAttachment(file: SlackFile): BridgeAttachment | undefined {
  if (!file.url_private) return undefined;
  return {
    url: file.url_private,
    filename: file.name,
    mimeType: file.mimetype,
    kind: fileKind(file.mimetype ?? file.filetype),
  };
}

function isAttachment(value: BridgeAttachment | undefined): value is BridgeAttachment {
  return Boolean(value);
}

function fileKind(value: string | undefined): BridgeAttachment['kind'] {
  if (value?.startsWith('image/')) return 'image';
  if (value?.startsWith('video/')) return 'video';
  if (value?.startsWith('audio/')) return 'audio';
  return 'file';
}

function renderMessage(msg: BridgeMessage): string {
  const prefix = `${msg.identity.username} [${msg.originalNetwork ?? msg.identity.network}]`;
  const attachments = msg.attachments?.map((attachment) => attachment.url).join('\n');
  return [`${prefix}: ${msg.text}`, attachments].filter(Boolean).join('\n');
}

function renderUsername(msg: BridgeMessage): string {
  return `${msg.identity.username} [${msg.originalNetwork ?? msg.identity.network}]`;
}

function slackTimestamp(value: string): string {
  const seconds = Number(value.split('.')[0]);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function websocketConstructor(): SlackWebSocketConstructor {
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: SlackWebSocketConstructor }).WebSocket;
  if (!WebSocketCtor) throw new Error('WebSocket is not available in this runtime');
  return WebSocketCtor;
}

function parseJson<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function redact(value: string, token: string): string {
  return value.split(token).join('[redacted]');
}
