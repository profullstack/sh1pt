import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { defineBot, tokenSetup, type BotEvent, type BotHandler, type BotReply } from '@profullstack/sh1pt-core';

type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface WeChatServerInfo {
  port: number;
  path: string;
  url: string;
}

export interface Config {
  appId?: string;
  appSecret?: string;
  token?: string;
  accessToken?: string;
  port?: number;
  path?: string;
  commandPrefix?: string;
  apiBaseUrl?: string;
  accessTokenUrl?: string;
  fetch?: FetchLike;
  onServerReady?: (info: WeChatServerInfo) => void | Promise<void>;
}

interface WeChatXmlMessage {
  ToUserName?: string;
  FromUserName?: string;
  CreateTime?: string;
  MsgType?: string;
  Content?: string;
  MsgId?: string;
  MediaId?: string;
  PicUrl?: string;
  Format?: string;
  ThumbMediaId?: string;
  Title?: string;
  Description?: string;
  Url?: string;
  Event?: string;
  EventKey?: string;
}

interface ResolvedConfig {
  appId: string;
  appSecret: string;
  token: string;
  accessToken?: string;
  port: number;
  path: string;
  commandPrefix: string;
  apiBaseUrl: string;
  accessTokenUrl: string;
  fetch: FetchLike;
  onServerReady?: (info: WeChatServerInfo) => void | Promise<void>;
}

interface WeChatAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface WeChatApiResponse {
  errcode?: number;
  errmsg?: string;
  msgid?: string | number;
}

const DEFAULT_API_BASE_URL = 'https://api.weixin.qq.com';
const DEFAULT_CALLBACK_PATH = '/wechat';
const DEFAULT_PORT = 3979;
const DEFAULT_COMMAND_PREFIX = '/';

function ensureFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch === 'function') return fetch as FetchLike;
  throw new Error('fetch is not available; provide config.fetch');
}

function resolveConfig(ctxSecret: (key: string) => string | undefined, config: Config): ResolvedConfig {
  const appId = config.appId ?? ctxSecret('WECHAT_APP_ID');
  const appSecret = config.appSecret ?? ctxSecret('WECHAT_APP_SECRET');
  const token = config.token ?? ctxSecret('WECHAT_TOKEN');
  if (!appId) throw new Error('WECHAT_APP_ID not in config or vault');
  if (!appSecret) throw new Error('WECHAT_APP_SECRET not in config or vault');
  if (!token) throw new Error('WECHAT_TOKEN not in config or vault');

  const path = normalizePath(config.path ?? DEFAULT_CALLBACK_PATH);
  return {
    appId,
    appSecret,
    token,
    accessToken: config.accessToken,
    port: config.port ?? DEFAULT_PORT,
    path,
    commandPrefix: config.commandPrefix ?? DEFAULT_COMMAND_PREFIX,
    apiBaseUrl: stripTrailingSlash(config.apiBaseUrl ?? DEFAULT_API_BASE_URL),
    accessTokenUrl: config.accessTokenUrl ?? `${DEFAULT_API_BASE_URL}/cgi-bin/token`,
    fetch: ensureFetch(config.fetch),
    onServerReady: config.onServerReady,
  };
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function verifySignature(token: string, query: URLSearchParams): boolean {
  const signature = query.get('signature');
  const timestamp = query.get('timestamp');
  const nonce = query.get('nonce');
  if (!signature || !timestamp || !nonce) return false;

  const expected = createHash('sha1')
    .update([token, timestamp, nonce].sort().join(''))
    .digest('hex');
  return timingSafeHexEqual(signature, expected);
}

function timingSafeHexEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function writeText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
  });
  res.end(text);
}

function writeXml(res: ServerResponse, status: number, xml: string): void {
  res.writeHead(status, {
    'content-type': 'application/xml; charset=utf-8',
  });
  res.end(xml);
}

function parseWeChatXml(xml: string): WeChatXmlMessage {
  const result: Record<string, string> = {};
  const body = xml.replace(/^\s*<xml>\s*/i, '').replace(/\s*<\/xml>\s*$/i, '');
  const tagPattern = /<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(body)) !== null) {
    const key = match[1];
    if (!key) continue;
    const value = match[2] ?? match[3] ?? '';
    result[key] = decodeXml(value.trim());
  }
  return result;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function cdata(value: string): string {
  return `<![CDATA[${value.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

function buildPassiveTextReply(input: WeChatXmlMessage, reply: BotReply): string {
  const content = renderReplyText(reply);
  return [
    '<xml>',
    `<ToUserName>${cdata(input.FromUserName ?? '')}</ToUserName>`,
    `<FromUserName>${cdata(input.ToUserName ?? '')}</FromUserName>`,
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>`,
    `<MsgType>${cdata('text')}</MsgType>`,
    `<Content>${cdata(content)}</Content>`,
    '</xml>',
  ].join('');
}

function renderReplyText(reply: BotReply): string {
  const lines = [reply.text ?? ''];
  for (const action of reply.actions ?? []) {
    if (action.url) lines.push(`${action.label}: ${action.url}`);
  }
  for (const attachment of reply.attachments ?? []) {
    lines.push(attachment.url);
  }
  return lines.filter(Boolean).join('\n');
}

function toBotEvent(input: WeChatXmlMessage, commandPrefix: string): BotEvent | undefined {
  const fromUser = input.FromUserName ?? '';
  const msgType = (input.MsgType ?? '').toLowerCase();
  const timestamp = input.CreateTime
    ? new Date(Number(input.CreateTime) * 1000).toISOString()
    : new Date().toISOString();

  if (msgType === 'event') {
    return toEventBotEvent(input, fromUser, timestamp);
  }

  const base = {
    channel: fromUser,
    user: {
      id: fromUser,
      displayName: fromUser,
    },
    timestamp,
    raw: input,
  };

  if (msgType === 'text') {
    const text = input.Content ?? '';
    const command = parseCommand(text, commandPrefix);
    if (command) {
      return {
        ...base,
        type: 'command',
        text,
        command: command.command,
        args: command.args,
        replyToId: input.MsgId,
      };
    }
    return {
      ...base,
      type: 'message',
      text,
      replyToId: input.MsgId,
    };
  }

  const attachment = toAttachment(input, msgType);
  if (!attachment) return undefined;
  return {
    ...base,
    type: 'message',
    text: input.Content ?? input.Description ?? input.Title,
    attachments: [attachment],
    replyToId: input.MsgId,
  };
}

function toEventBotEvent(input: WeChatXmlMessage, fromUser: string, timestamp: string): BotEvent | undefined {
  const eventName = (input.Event ?? '').toUpperCase();
  const base = {
    channel: fromUser,
    user: {
      id: fromUser,
      displayName: fromUser,
    },
    timestamp,
    raw: input,
  };

  if (eventName === 'SUBSCRIBE') return { ...base, type: 'join' };
  if (eventName === 'UNSUBSCRIBE') return { ...base, type: 'leave' };
  if (input.EventKey) {
    return {
      ...base,
      type: 'interaction',
      text: input.EventKey,
    };
  }
  return undefined;
}

function parseCommand(text: string, commandPrefix: string): { command: string; args: string[] } | undefined {
  if (!commandPrefix || !text.startsWith(commandPrefix)) return undefined;
  const [commandWithPrefix = '', ...args] = text.slice(commandPrefix.length).trim().split(/\s+/).filter(Boolean);
  if (!commandWithPrefix) return undefined;
  return {
    command: commandWithPrefix,
    args,
  };
}

function toAttachment(input: WeChatXmlMessage, msgType: string): { url: string; mimeType?: string; filename?: string } | undefined {
  if (msgType === 'image' && input.PicUrl) {
    return {
      url: input.PicUrl,
      mimeType: 'image/*',
      filename: input.MediaId,
    };
  }
  if (msgType === 'voice' && input.MediaId) {
    return {
      url: `wechat-media:${input.MediaId}`,
      mimeType: input.Format ? `audio/${input.Format}` : 'audio/*',
      filename: input.MediaId,
    };
  }
  if ((msgType === 'video' || msgType === 'shortvideo') && input.MediaId) {
    return {
      url: `wechat-media:${input.MediaId}`,
      mimeType: 'video/*',
      filename: input.MediaId,
    };
  }
  if (msgType === 'link' && input.Url) {
    return {
      url: input.Url,
      filename: input.Title,
    };
  }
  return undefined;
}

function matchesHandler(handler: BotHandler, event: BotEvent): boolean {
  const match = handler.match;
  if (match.type !== event.type) return false;
  if (match.type === 'message') return !match.pattern || match.pattern.test(event.text ?? '');
  if (match.type === 'command') return match.command === event.command;
  if (match.type === 'interaction') return !match.actionId || match.actionId === event.text;
  return true;
}

async function dispatch(ctx: Parameters<BotHandler['handle']>[0], handlers: BotHandler[], event: BotEvent): Promise<BotReply | undefined> {
  for (const handler of handlers) {
    if (!matchesHandler(handler, event)) continue;
    const reply = await handler.handle(ctx, event);
    if (reply) return reply;
  }
  return undefined;
}

async function fetchAccessToken(config: ResolvedConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;
  const url = new URL(config.accessTokenUrl);
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', config.appId);
  url.searchParams.set('secret', config.appSecret);

  const response = await config.fetch(url.toString(), { method: 'GET' });
  const payload = await response.json() as WeChatAccessTokenResponse;
  if (!response.ok || !payload.access_token) {
    const detail = payload.errcode ? ` (${payload.errcode}: ${payload.errmsg ?? 'unknown error'})` : '';
    throw new Error(`WeChat access_token request failed with HTTP ${response.status}${detail}`);
  }
  return payload.access_token;
}

async function sendCustomText(config: ResolvedConfig, openId: string, reply: BotReply): Promise<{ id: string }> {
  const accessToken = await fetchAccessToken(config);
  const url = new URL(`${config.apiBaseUrl}/cgi-bin/message/custom/send`);
  url.searchParams.set('access_token', accessToken);

  const response = await config.fetch(url.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      touser: openId,
      msgtype: 'text',
      text: {
        content: renderReplyText(reply),
      },
    }),
  });
  const payload = await response.json() as WeChatApiResponse;
  if (!response.ok || (payload.errcode ?? 0) !== 0) {
    throw new Error(`WeChat custom send failed (${payload.errcode ?? response.status}: ${payload.errmsg ?? 'unknown error'})`);
  }
  return { id: payload.msgid ? String(payload.msgid) : `wc_${Date.now()}` };
}

export default defineBot<Config>({
  id: 'bot-wechat',
  label: 'WeChat',
  supports: ['message', 'command', 'interaction', 'join', 'leave'],

  async register(ctx, handlers, config) {
    const resolved = resolveConfig(ctx.secret, config);
    ctx.log(`bot-wechat · register ${handlers.length} handlers (app=${resolved.appId})`);
    if (ctx.dryRun) return { async close() {} };

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        if (url.pathname !== resolved.path) {
          writeText(res, 404, 'not found');
          return;
        }
        if (!verifySignature(resolved.token, url.searchParams)) {
          writeText(res, 403, 'invalid signature');
          return;
        }
        if (req.method === 'GET') {
          writeText(res, 200, url.searchParams.get('echostr') ?? '');
          return;
        }
        if (req.method !== 'POST') {
          writeText(res, 405, 'method not allowed');
          return;
        }

        const body = await readRequestBody(req);
        const xmlMessage = parseWeChatXml(body);
        const event = toBotEvent(xmlMessage, resolved.commandPrefix);
        if (!event) {
          writeText(res, 200, '');
          return;
        }
        const reply = await dispatch(ctx, handlers, event);
        if (reply) writeXml(res, 200, buildPassiveTextReply(xmlMessage, reply));
        else writeText(res, 200, '');
      } catch (error) {
        ctx.log(`bot-wechat · webhook error: ${error instanceof Error ? error.message : String(error)}`);
        writeText(res, 500, '');
      }
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(resolved.port);
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : resolved.port;
    await resolved.onServerReady?.({
      port,
      path: resolved.path,
      url: `http://localhost:${port}${resolved.path}`,
    });

    return {
      async close() {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      },
    };
  },

  async send(ctx, channel, reply, config) {
    const resolved = resolveConfig(ctx.secret, config);
    ctx.log(`bot-wechat · send → openid=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    return sendCustomText(resolved, channel, reply);
  },

  setup: tokenSetup({
    secretKey: 'WECHAT_APP_SECRET',
    label: 'WeChat Official Account',
    vendorDocUrl: 'https://mp.weixin.qq.com/',
    steps: [
      'Open https://mp.weixin.qq.com/',
      'Create or open a WeChat Official Account app',
      'Save the AppID as WECHAT_APP_ID and AppSecret as WECHAT_APP_SECRET',
      'Set a callback Token and save the same value as WECHAT_TOKEN',
    ],
  }),
});
