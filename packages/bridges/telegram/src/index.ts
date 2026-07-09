import { defineBridge, tokenSetup, type BridgeMessage } from '@profullstack/sh1pt-core';

// Telegram bridge — Bot API (getUpdates long-polling or webhook)
// receive, sendMessage send. "Channels" are chat_ids (channel = -100…,
// group = -…, DM = positive). Bot must be added to the group with read
// access (disable group privacy mode in BotFather if you want it to
// see all messages, not just commands).
interface Config {
  useWebhook?: boolean;             // if true, receive via webhook instead of long-poll
  webhookUrl?: string;
  tokenKey?: string;                // default TELEGRAM_BRIDGE_BOT_TOKEN, falls back to TELEGRAM_BOT_TOKEN
  baseUrl?: string;                 // test/self-hosted Bot API base
  pollTimeoutSeconds?: number;
  pollLimit?: number;
  parseMode?: 'MarkdownV2' | 'HTML';
  disableNotification?: boolean;
}

const DEFAULT_API = 'https://api.telegram.org';
const DEFAULT_TOKEN_KEY = 'TELEGRAM_BRIDGE_BOT_TOKEN';

export default defineBridge<Config>({
  id: 'bridge-telegram',
  label: 'Telegram',

  async subscribe(ctx, channels, onMessage, config) {
    const token = telegramToken(ctx, config);
    if (config.useWebhook) {
      throw new Error('bridge-telegram subscribe() currently supports long polling only; unset useWebhook');
    }

    const api = apiBase(config);
    const channelSet = new Set(channels.map(String));
    let closed = false;
    let offset = 0;

    ctx.log(`telegram bridge · chats=${channels.length} · mode=long-poll`);

    const poll = async () => {
      while (!closed && !ctx.signal?.aborted) {
        const url = new URL(`${api}/bot${token}/getUpdates`);
        url.searchParams.set('timeout', String(config.pollTimeoutSeconds ?? 30));
        url.searchParams.set('limit', String(config.pollLimit ?? 100));
        url.searchParams.set('allowed_updates', JSON.stringify([
          'message',
          'edited_message',
          'channel_post',
          'edited_channel_post',
        ]));
        if (offset > 0) url.searchParams.set('offset', String(offset));

        const res = await fetch(url, { signal: ctx.signal });
        const body = await readTelegramJson<TelegramUpdatesResponse>(res);
        if (!res.ok || !body.ok) {
          throw new Error(body.description ?? `Telegram getUpdates failed with ${res.status}`);
        }

        for (const update of body.result ?? []) {
          offset = Math.max(offset, update.update_id + 1);
          const msg = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
          const bridged = msg ? toBridgeMessage(msg) : undefined;
          if (bridged && channelSet.has(bridged.channel)) {
            await onMessage(bridged);
          }
        }
      }
    };

    void poll().catch((err) => {
      if (!closed && !ctx.signal?.aborted) ctx.log(`telegram bridge polling stopped: ${err instanceof Error ? err.message : String(err)}`);
    });

    return {
      async close() {
        closed = true;
      },
    };
  },

  async send(ctx, channel, msg, config) {
    const token = telegramToken(ctx, config);
    ctx.log(`telegram bridge · sendMessage chat=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const res = await fetch(`${apiBase(config)}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: channel,
        text: renderTelegramText(msg, config).slice(0, 4096),
        parse_mode: config.parseMode,
        disable_notification: config.disableNotification,
        reply_to_message_id: msg.replyToId ? Number(msg.replyToId) : undefined,
      }),
    });
    const body = await readTelegramJson<TelegramSendResponse>(res);
    if (!res.ok || !body.ok) {
      throw new Error(body.description ?? `Telegram sendMessage failed with ${res.status}`);
    }

    return { id: String(body.result?.message_id ?? 'telegram-message') };
  },

  setup: tokenSetup({
    secretKey: DEFAULT_TOKEN_KEY,
    label: 'Telegram bridge',
    vendorDocUrl: 'https://core.telegram.org/bots',
    steps: [
      'Open https://core.telegram.org/bots',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
});

function telegramToken(
  ctx: { secret(k: string): string | undefined },
  config: Config,
): string {
  const key = config.tokenKey ?? DEFAULT_TOKEN_KEY;
  const token = ctx.secret(key) ?? (key === DEFAULT_TOKEN_KEY ? ctx.secret('TELEGRAM_BOT_TOKEN') : undefined);
  if (!token) throw new Error(`${key} not in vault — run: sh1pt secret set ${key} <bot-token>`);
  return token;
}

function apiBase(config: Config): string {
  return (config.baseUrl ?? DEFAULT_API).replace(/\/$/, '');
}

function renderTelegramText(msg: BridgeMessage, config: Config): string {
  const source = `${msg.identity.username} [${msg.originalNetwork ?? msg.identity.network}]`;
  const attachmentLines = (msg.attachments ?? []).map((a) => `${a.kind}: ${a.url}`);
  const text = [msg.text, ...attachmentLines].filter(Boolean).join('\n');

  if (config.parseMode === 'MarkdownV2') {
    return `*${escapeMarkdown(source)}*: ${escapeMarkdown(text)}`;
  }
  if (config.parseMode === 'HTML') {
    return `<b>${escapeHtml(source)}</b>: ${escapeHtml(text)}`;
  }
  return `${source}: ${text}`;
}

function toBridgeMessage(message: TelegramMessage): BridgeMessage {
  const author = message.from ?? message.sender_chat ?? { id: message.chat.id, first_name: message.chat.title ?? String(message.chat.id) };
  const username = telegramUsername(author);
  return {
    id: String(message.message_id),
    channel: String(message.chat.id),
    identity: {
      network: 'telegram',
      username,
      isBot: 'is_bot' in author ? author.is_bot : undefined,
    },
    text: message.text ?? message.caption ?? '',
    replyToId: message.reply_to_message?.message_id ? String(message.reply_to_message.message_id) : undefined,
    attachments: telegramAttachments(message),
    timestamp: new Date(message.date * 1000).toISOString(),
    originalNetwork: 'telegram',
  };
}

function telegramUsername(user: TelegramUser | TelegramChat): string {
  if ('username' in user && user.username) return user.username;
  if ('first_name' in user) return [user.first_name, user.last_name].filter(Boolean).join(' ');
  return user.title ?? String(user.id);
}

function telegramAttachments(message: TelegramMessage): BridgeMessage['attachments'] {
  const attachments: NonNullable<BridgeMessage['attachments']> = [];
  const photo = message.photo?.at(-1);
  if (photo?.file_id) attachments.push({ url: `telegram:file/${photo.file_id}`, kind: 'image' });
  if (message.video?.file_id) attachments.push({ url: `telegram:file/${message.video.file_id}`, kind: 'video', mimeType: message.video.mime_type });
  if (message.audio?.file_id) attachments.push({ url: `telegram:file/${message.audio.file_id}`, kind: 'audio', mimeType: message.audio.mime_type });
  if (message.document?.file_id) {
    attachments.push({
      url: `telegram:file/${message.document.file_id}`,
      kind: 'file',
      filename: message.document.file_name,
      mimeType: message.document.mime_type,
    });
  }
  return attachments.length > 0 ? attachments : undefined;
}

async function readTelegramJson<T>(res: Response): Promise<T & TelegramApiResponse> {
  try {
    return await res.json() as T & TelegramApiResponse;
  } catch {
    return { ok: res.ok, description: res.statusText } as T & TelegramApiResponse;
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (char) => `\\${char}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
}

interface TelegramUpdatesResponse extends TelegramApiResponse {
  result?: TelegramUpdate[];
}

interface TelegramSendResponse extends TelegramApiResponse {
  result?: {
    message_id?: number;
  };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number };
  photo?: Array<{ file_id: string }>;
  video?: TelegramFile;
  audio?: TelegramFile;
  document?: TelegramFile & { file_name?: string };
}

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type?: string;
  title?: string;
  username?: string;
}

interface TelegramFile {
  file_id: string;
  mime_type?: string;
}
