import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { defineBot, tokenSetup, type BotCtx, type BotEvent, type BotHandler, type BotReply } from '@profullstack/sh1pt-core';

// Telnyx - programmable SMS + Voice, similar surface to Twilio, often
// lower egress cost. API key auth (TELNYX_API_KEY). SMS via Messaging
// Profile + phone number; Voice via Call Control (webhook-driven state
// machine) with built-in STT via "transcription.started" events.
interface Config {
  messagingProfileId?: string;
  connectionId?: string;
  from?: string;
  mode?: 'sms' | 'voice' | 'both';
  commandPrefix?: string;
  webhookHost?: string;
  webhookPort?: number;
  messagingPath?: string;
  callControlPath?: string;
  webhookUrl?: string;
  publicKey?: string;
  validateSignature?: boolean;
  signatureToleranceSeconds?: number;
  voice?: string;
}

const API = 'https://api.telnyx.com/v2';
const DEFAULT_COMMAND_PREFIX = '!';
const DEFAULT_MESSAGING_PATH = '/telnyx/messaging';
const DEFAULT_CALL_CONTROL_PATH = '/telnyx/call-control';
const DEFAULT_VOICE = 'female';
const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

class TelnyxWebhookServer {
  private server?: Server;
  private port?: number;

  constructor(
    private readonly ctx: BotCtx,
    private readonly handlers: BotHandler[],
    private readonly config: Config,
    private readonly token: string,
  ) {}

  async start(): Promise<{ close(): Promise<void>; port?: number }> {
    this.server = createServer((request, response) => {
      void this.route(request, response).catch((err) => {
        this.ctx.log(`bot-telnyx webhook error: ${err instanceof Error ? err.message : String(err)}`);
        sendJson(response, 500, { error: 'webhook_error' });
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.config.webhookPort ?? 0, this.config.webhookHost ?? '127.0.0.1', () => resolve());
    });
    const address = this.server.address();
    this.port = typeof address === 'object' && address ? address.port : undefined;
    this.ctx.log(`bot-telnyx · webhook listening on ${this.config.webhookHost ?? '127.0.0.1'}:${this.port}`);
    return { close: () => this.close(), port: this.port };
  }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = undefined;
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const body = await readBody(request);
    if (!this.validSignature(request, body)) {
      sendJson(response, 403, { error: 'invalid_signature' });
      return;
    }
    const event = parseEvent(body);
    if (path === (this.config.messagingPath ?? DEFAULT_MESSAGING_PATH)) {
      await this.handleMessaging(event, response);
      return;
    }
    if (path === (this.config.callControlPath ?? DEFAULT_CALL_CONTROL_PATH)) {
      await this.handleCallControl(event, response);
      return;
    }
    sendJson(response, 404, { error: 'not_found' });
  }

  private async handleMessaging(payload: TelnyxEvent, response: ServerResponse): Promise<void> {
    const telnyxPayload = payload.data?.payload ?? {};
    if (payload.data?.event_type && payload.data.event_type !== 'message.received') {
      sendJson(response, 200, { ok: true, ignored: true });
      return;
    }
    const from = phoneNumber(telnyxPayload.from) ?? 'unknown';
    const text = stringValue(telnyxPayload.text) ?? '';
    const event = textEvent({
      text,
      channel: from,
      userId: from,
      displayName: from,
      raw: payload,
      commandPrefix: this.config.commandPrefix ?? DEFAULT_COMMAND_PREFIX,
      timestamp: new Date().toISOString(),
    });
    const reply = await firstReply(this.ctx, this.handlers, event);
    if (reply?.text) {
      await sendSms(this.token, from, reply, this.config);
    }
    sendJson(response, 200, { ok: true });
  }

  private async handleCallControl(payload: TelnyxEvent, response: ServerResponse): Promise<void> {
    const telnyxPayload = payload.data?.payload ?? {};
    const event = callEvent(payload, telnyxPayload);
    const reply = await firstReply(this.ctx, this.handlers, event);
    const callControlId = stringValue(telnyxPayload.call_control_id) ?? stringValue(telnyxPayload.call_control_id_v2);
    if (reply && callControlId) {
      await sendCallReply(this.token, callControlId, reply, this.config);
    }
    sendJson(response, 200, { ok: true });
  }

  private validSignature(request: IncomingMessage, body: string): boolean {
    const shouldValidate = this.config.validateSignature ?? Boolean(this.config.publicKey);
    if (!shouldValidate) return true;
    const publicKey = this.config.publicKey;
    if (!publicKey) return false;
    const signature = request.headers['telnyx-signature-ed25519'];
    const timestamp = request.headers['telnyx-timestamp'];
    if (typeof signature !== 'string' || typeof timestamp !== 'string') return false;
    const tolerance = this.config.signatureToleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS;
    if (!validTimestamp(timestamp, tolerance)) return false;
    return verifyTelnyxSignature(publicKey, timestamp, body, signature);
  }
}

interface TelnyxEvent {
  data?: {
    event_type?: string;
    payload?: Record<string, unknown>;
  };
}

function resolveConfig(ctx: { secret(k: string): string | undefined }, config: Config): Config {
  return {
    ...config,
    from: config.from ?? ctx.secret('TELNYX_FROM_NUMBER'),
    messagingProfileId: config.messagingProfileId ?? ctx.secret('TELNYX_MESSAGING_PROFILE_ID'),
    connectionId: config.connectionId ?? ctx.secret('TELNYX_CONNECTION_ID'),
    publicKey: config.publicKey ?? ctx.secret('TELNYX_PUBLIC_KEY'),
  };
}

function apiKey(ctx: { secret(k: string): string | undefined }): string {
  const token = ctx.secret('TELNYX_API_KEY');
  if (!token) throw new Error('TELNYX_API_KEY not in vault');
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

function callEvent(event: TelnyxEvent, payload: Record<string, unknown>): BotEvent {
  const eventType = event.data?.event_type ?? '';
  const transcript = transcriptText(payload);
  const type: BotEvent['type'] = transcript
    ? 'call.utterance'
    : eventType === 'call.hangup'
      ? 'call.end'
      : 'call.start';
  const from = phoneNumber(payload.from) ?? stringValue(payload.from) ?? 'unknown';
  return {
    type,
    channel: stringValue(payload.call_control_id) ?? stringValue(payload.call_leg_id) ?? from,
    user: {
      id: from,
      displayName: from,
    },
    text: transcript ?? eventType,
    timestamp: new Date().toISOString(),
    raw: event,
  };
}

async function firstReply(ctx: BotCtx, handlers: BotHandler[], event: BotEvent): Promise<BotReply | void> {
  for (const handler of handlers) {
    const reply = await handler.handle(ctx, event);
    if (reply) return reply;
  }
}

async function sendSms(token: string, channel: string, reply: BotReply, config: Config): Promise<{ id: string }> {
  const from = config.from;
  if (!from) throw new Error('TELNYX_FROM_NUMBER is required for SMS');
  const payload: Record<string, unknown> = {
    from,
    to: channel,
    text: reply.text ?? '',
  };
  if (config.messagingProfileId) payload.messaging_profile_id = config.messagingProfileId;
  if (config.webhookUrl) payload.webhook_url = config.webhookUrl;
  const response = await telnyxPost<{ data?: { id?: string } }>(token, '/messages', payload);
  return { id: response.data?.id ?? `txs_${Date.now()}` };
}

async function dialVoice(token: string, channel: string, reply: BotReply, config: Config): Promise<{ id: string }> {
  if (!config.from) throw new Error('TELNYX_FROM_NUMBER is required for voice calls');
  if (!config.connectionId) throw new Error('TELNYX_CONNECTION_ID is required for voice calls');
  const response = await telnyxPost<{ data?: { call_control_id?: string; call_leg_id?: string } }>(token, '/calls', {
    connection_id: config.connectionId,
    from: config.from,
    to: channel,
  });
  const callControlId = response.data?.call_control_id;
  if (callControlId) {
    await sendCallReply(token, callControlId, reply, config);
  }
  return { id: callControlId ?? response.data?.call_leg_id ?? `txv_${Date.now()}` };
}

async function sendCallReply(token: string, callControlId: string, reply: BotReply, config: Config): Promise<void> {
  if (reply.voice?.play) {
    await telnyxPost(token, `/calls/${encodeURIComponent(callControlId)}/actions/playback_start`, {
      audio_url: reply.voice.play,
    });
    return;
  }
  const text = reply.voice?.say ?? reply.text;
  if (!text) return;
  await telnyxPost(token, `/calls/${encodeURIComponent(callControlId)}/actions/speak`, {
    payload: text,
    voice: config.voice ?? DEFAULT_VOICE,
  });
}

async function telnyxPost<T>(token: string, path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    const message = errorMessage(data, text, response.statusText);
    throw new Error(`Telnyx ${path} failed: ${response.status} ${redact(message, token)}`);
  }
  return data as T;
}

function verifyTelnyxSignature(publicKeyValue: string, timestamp: string, body: string, signature: string): boolean {
  try {
    const key = telnyxPublicKey(publicKeyValue);
    const expected = Buffer.from(signature, 'base64');
    return verifySignature(null, Buffer.from(`${timestamp}|${body}`), key, expected);
  } catch {
    return false;
  }
}

function telnyxPublicKey(value: string): ReturnType<typeof createPublicKey> {
  const trimmed = value.trim();
  if (trimmed.startsWith('-----BEGIN')) return createPublicKey(trimmed);
  const raw = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (raw.length === 32) {
    return createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
      format: 'der',
      type: 'spki',
    });
  }
  return createPublicKey({ key: raw, format: 'der', type: 'spki' });
}

function validTimestamp(value: string, toleranceSeconds: number): boolean {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(Date.now() / 1000 - parsed) <= toleranceSeconds;
}

function parseEvent(body: string): TelnyxEvent {
  const parsed = parseJson(body);
  return typeof parsed === 'object' && parsed ? parsed as TelnyxEvent : {};
}

function transcriptText(payload: Record<string, unknown>): string | undefined {
  const direct = stringValue(payload.transcript) ?? stringValue(payload.transcription);
  if (direct) return direct;
  const data = payload.transcription_data;
  if (typeof data === 'object' && data) {
    return stringValue((data as Record<string, unknown>).transcript);
  }
}

function phoneNumber(value: unknown): string | undefined {
  if (typeof value === 'object' && value) {
    return stringValue((value as Record<string, unknown>).phone_number);
  }
  return stringValue(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
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

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
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
  if (typeof data === 'object' && data && 'errors' in data && Array.isArray(data.errors)) {
    return data.errors.map((err) => errorMessage(err, '', '')).filter(Boolean).join('; ') || fallback;
  }
  if (typeof data === 'object' && data && 'detail' in data && typeof data.detail === 'string') return data.detail;
  if (typeof data === 'object' && data && 'message' in data && typeof data.message === 'string') return data.message;
  return text || fallback;
}

function redact(value: string, token: string): string {
  return value.split(token).join('[redacted]');
}

export default defineBot<Config>({
  id: 'bot-telnyx',
  label: 'Telnyx (SMS + Voice)',
  supports: ['message', 'command', 'call.start', 'call.end', 'call.utterance'],

  async register(ctx, handlers, config) {
    const token = apiKey(ctx);
    const resolved = resolveConfig(ctx, config);
    ctx.log(`bot-telnyx · register ${handlers.length} handlers (mode=${resolved.mode ?? 'both'}, from=${resolved.from ?? 'not-set'})`);
    if (ctx.dryRun) return { async close() {} };
    return new TelnyxWebhookServer(ctx, handlers, resolved, token).start();
  },

  async send(ctx, channel, reply, config) {
    const token = apiKey(ctx);
    const resolved = resolveConfig(ctx, config);
    ctx.log(`bot-telnyx · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    if (reply.voice) {
      return dialVoice(token, channel, reply, resolved);
    }
    return sendSms(token, channel, reply, resolved);
  },

  setup: tokenSetup({
    secretKey: 'TELNYX_API_KEY',
    label: 'Telnyx SMS/voice',
    vendorDocUrl: 'https://portal.telnyx.com/#/app/api-keys',
    steps: [
      'Open https://portal.telnyx.com/#/app/api-keys',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
});
