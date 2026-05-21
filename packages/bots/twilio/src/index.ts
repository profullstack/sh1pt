import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { defineBot, tokenSetup, type BotCtx, type BotEvent, type BotHandler, type BotReply } from '@profullstack/sh1pt-core';

// Twilio — SMS (Programmable Messaging) + Voice (Programmable Voice) from
// the same account. Channel strings are E.164 phone numbers for both.
// SMS: inbound via webhook → 'message'; outbound via /Messages.json.
// Voice: inbound call webhook → 'call.start' / 'call.utterance' events
// (after <Gather>/STT step); outbound via /Calls.json with TwiML <Say>.
interface Config {
  accountSid?: string;
  from?: string;
  messagingServiceSid?: string;
  mode?: 'sms' | 'voice' | 'both';
  commandPrefix?: string;
  webhookHost?: string;
  webhookPort?: number;
  smsPath?: string;
  voicePath?: string;
  webhookBaseUrl?: string;
  validateSignature?: boolean;
  statusCallbackUrl?: string;
}

const API = 'https://api.twilio.com/2010-04-01';
const DEFAULT_COMMAND_PREFIX = '!';
const DEFAULT_SMS_PATH = '/twilio/sms';
const DEFAULT_VOICE_PATH = '/twilio/voice';

class TwilioWebhookServer {
  private server?: Server;
  private port?: number;

  constructor(
    private readonly ctx: BotCtx,
    private readonly handlers: BotHandler[],
    private readonly config: Required<Pick<Config, 'accountSid' | 'from'>> & Config,
    private readonly authToken: string,
  ) {}

  async start(): Promise<{ close(): Promise<void>; port?: number }> {
    this.server = createServer((request, response) => {
      void this.route(request, response).catch((err) => {
        this.ctx.log(`bot-twilio webhook error: ${err instanceof Error ? err.message : String(err)}`);
        sendXml(response, 500, '<Response/>');
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.config.webhookPort ?? 0, this.config.webhookHost ?? '127.0.0.1', () => resolve());
    });
    const address = this.server.address();
    this.port = typeof address === 'object' && address ? address.port : undefined;
    this.ctx.log(`bot-twilio · webhook listening on ${this.config.webhookHost ?? '127.0.0.1'}:${this.port}`);
    return { close: () => this.close(), port: this.port };
  }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = undefined;
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      sendXml(response, 405, '<Response/>');
      return;
    }
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const body = await readBody(request);
    const params = new URLSearchParams(body);
    if (!this.validSignature(request, path, params)) {
      sendXml(response, 403, '<Response/>');
      return;
    }
    if (path === (this.config.smsPath ?? DEFAULT_SMS_PATH)) {
      await this.handleSms(params, response);
      return;
    }
    if (path === (this.config.voicePath ?? DEFAULT_VOICE_PATH)) {
      await this.handleVoice(params, response);
      return;
    }
    sendXml(response, 404, '<Response/>');
  }

  private async handleSms(params: URLSearchParams, response: ServerResponse): Promise<void> {
    const text = params.get('Body') ?? '';
    const event = textEvent({
      text,
      channel: params.get('From') ?? 'unknown',
      userId: params.get('From') ?? 'unknown',
      displayName: params.get('From') ?? undefined,
      raw: Object.fromEntries(params),
      commandPrefix: this.config.commandPrefix ?? DEFAULT_COMMAND_PREFIX,
      timestamp: new Date().toISOString(),
    });
    const reply = await firstReply(this.ctx, this.handlers, event);
    sendXml(response, 200, `<Response>${reply?.text ? `<Message>${escapeXml(reply.text)}</Message>` : ''}</Response>`);
  }

  private async handleVoice(params: URLSearchParams, response: ServerResponse): Promise<void> {
    const speech = params.get('SpeechResult') ?? '';
    const status = params.get('CallStatus') ?? '';
    const type: BotEvent['type'] = speech ? 'call.utterance' : status === 'completed' ? 'call.end' : 'call.start';
    const event: BotEvent = {
      type,
      channel: params.get('CallSid') ?? params.get('From') ?? 'unknown',
      user: {
        id: params.get('From') ?? 'unknown',
        displayName: params.get('Caller') ?? params.get('From') ?? undefined,
      },
      text: speech || status || undefined,
      timestamp: new Date().toISOString(),
      raw: Object.fromEntries(params),
    };
    const reply = await firstReply(this.ctx, this.handlers, event);
    const prompt = reply ? twimlForReply(reply) : `<Gather input="speech" action="${escapeXml(this.config.voicePath ?? DEFAULT_VOICE_PATH)}" method="POST" timeout="5"/>`;
    sendXml(response, 200, `<Response>${prompt}</Response>`);
  }

  private validSignature(request: IncomingMessage, path: string, params: URLSearchParams): boolean {
    const shouldValidate = this.config.validateSignature ?? Boolean(this.config.webhookBaseUrl);
    if (!shouldValidate) return true;
    if (!this.config.webhookBaseUrl) return false;
    const signature = request.headers['x-twilio-signature'];
    if (typeof signature !== 'string') return false;
    const fullUrl = `${this.config.webhookBaseUrl.replace(/\/+$/, '')}${path}`;
    return validateTwilioSignature(fullUrl, params, this.authToken, signature);
  }
}

function resolveConfig(ctx: { secret(k: string): string | undefined }, config: Config): Config {
  return {
    ...config,
    accountSid: config.accountSid ?? ctx.secret('TWILIO_ACCOUNT_SID'),
    from: config.from ?? ctx.secret('TWILIO_FROM_NUMBER'),
    messagingServiceSid: config.messagingServiceSid ?? ctx.secret('TWILIO_MESSAGING_SERVICE_SID'),
  };
}

function authToken(ctx: { secret(k: string): string | undefined }, config: Config): string {
  const token = ctx.secret('TWILIO_AUTH_TOKEN');
  if (!token) throw new Error('TWILIO_AUTH_TOKEN not in vault');
  if (!config.accountSid) throw new Error('TWILIO_ACCOUNT_SID is required');
  return token;
}

function textEvent(input: {
  text: string;
  channel: string;
  userId: string;
  displayName?: string;
  raw: unknown;
  commandPrefix: string;
  timestamp: string;
}): BotEvent {
  const isCommand = input.text.startsWith(input.commandPrefix) && input.text.length > input.commandPrefix.length;
  const [command, ...args] = isCommand ? input.text.slice(input.commandPrefix.length).trim().split(/\s+/) : [];
  return {
    type: isCommand ? 'command' : 'message',
    channel: input.channel,
    user: {
      id: input.userId,
      displayName: input.displayName,
    },
    text: input.text,
    command,
    args: isCommand ? args : undefined,
    timestamp: input.timestamp,
    raw: input.raw,
  };
}

async function firstReply(ctx: BotCtx, handlers: BotHandler[], event: BotEvent): Promise<BotReply | void> {
  for (const handler of handlers) {
    const reply = await handler.handle(ctx, event);
    if (reply) return reply;
  }
}

async function twilioPost<T>(accountSid: string, authTokenValue: string, resource: 'Messages' | 'Calls', params: URLSearchParams): Promise<T> {
  const response = await fetch(`${API}/Accounts/${encodeURIComponent(accountSid)}/${resource}.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authTokenValue}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params,
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    const message = errorMessage(data, text, response.statusText);
    throw new Error(`Twilio ${resource} failed: ${response.status} ${redact(message, authTokenValue)}`);
  }
  return data as T;
}

function smsParams(channel: string, reply: BotReply, config: Required<Pick<Config, 'accountSid'>> & Config): URLSearchParams {
  const params = new URLSearchParams({
    To: channel,
    Body: reply.text ?? '',
  });
  if (config.messagingServiceSid) {
    params.set('MessagingServiceSid', config.messagingServiceSid);
  } else if (config.from) {
    params.set('From', config.from);
  } else {
    throw new Error('TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID is required for SMS');
  }
  if (config.statusCallbackUrl) params.set('StatusCallback', config.statusCallbackUrl);
  return params;
}

function callParams(channel: string, reply: BotReply, config: Required<Pick<Config, 'accountSid' | 'from'>> & Config): URLSearchParams {
  const params = new URLSearchParams({
    To: channel,
    From: config.from,
    Twiml: `<Response>${twimlForReply(reply)}</Response>`,
  });
  if (config.statusCallbackUrl) params.set('StatusCallback', config.statusCallbackUrl);
  return params;
}

function twimlForReply(reply: BotReply): string {
  if (reply.voice?.play) return `<Play>${escapeXml(reply.voice.play)}</Play>`;
  const text = reply.voice?.say ?? reply.text ?? '';
  return text ? `<Say>${escapeXml(text)}</Say>` : '';
}

function validateTwilioSignature(url: string, params: URLSearchParams, authTokenValue: string, signature: string): boolean {
  const payload = [...params.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .reduce((acc, [key, value]) => acc + key + value, url);
  const expected = createHmac('sha1', authTokenValue).update(payload).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendXml(response: ServerResponse, status: number, xml: string): void {
  response.writeHead(status, { 'Content-Type': 'text/xml; charset=utf-8' });
  response.end(xml);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  if (typeof data === 'object' && data && 'message' in data && typeof data.message === 'string') return data.message;
  return text || fallback;
}

function redact(value: string, token: string): string {
  return value.split(token).join('[redacted]');
}

export default defineBot<Config>({
  id: 'bot-twilio',
  label: 'Twilio (SMS + Voice)',
  supports: ['message', 'command', 'call.start', 'call.end', 'call.utterance'],

  async register(ctx, handlers, config) {
    const resolved = resolveConfig(ctx, config);
    const token = authToken(ctx, resolved);
    if (!resolved.from) throw new Error('TWILIO_FROM_NUMBER is required');
    ctx.log(`bot-twilio · register ${handlers.length} handlers (mode=${resolved.mode ?? 'both'}, from=${resolved.from})`);
    if (ctx.dryRun) return { async close() {} };
    return new TwilioWebhookServer(
      ctx,
      handlers,
      resolved as Required<Pick<Config, 'accountSid' | 'from'>> & Config,
      token,
    ).start();
  },

  async send(ctx, channel, reply, config) {
    const resolved = resolveConfig(ctx, config);
    const token = authToken(ctx, resolved);
    ctx.log(`bot-twilio · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    if (reply.voice) {
      if (!resolved.from) throw new Error('TWILIO_FROM_NUMBER is required for voice calls');
      const call = await twilioPost<{ sid?: string }>(
        resolved.accountSid!,
        token,
        'Calls',
        callParams(channel, reply, resolved as Required<Pick<Config, 'accountSid' | 'from'>> & Config),
      );
      return { id: call.sid ?? `tv_${Date.now()}` };
    }
    const message = await twilioPost<{ sid?: string }>(
      resolved.accountSid!,
      token,
      'Messages',
      smsParams(channel, reply, resolved as Required<Pick<Config, 'accountSid'>> & Config),
    );
    return { id: message.sid ?? `ts_${Date.now()}` };
  },

  setup: tokenSetup({
    secretKey: 'TWILIO_AUTH_TOKEN',
    label: 'Twilio SMS/voice',
    vendorDocUrl: 'https://console.twilio.com/',
    steps: [
      'Open https://console.twilio.com/',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
});
