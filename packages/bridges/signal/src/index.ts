import { defineBridge, manualSetup, type BridgeAttachment, type BridgeMessage } from '@profullstack/sh1pt-core';

// Signal bridge: use a dedicated signal-cli daemon over its documented
// JSON-RPC HTTP endpoints. Signal account registration remains a manual,
// phone-number-bound setup step.
export interface SignalBridgeConfig {
  phoneNumber?: string;
  runtime: 'signal-cli' | 'signald';
  rpcEndpoint?: string;
  eventsEndpoint?: string;
}

interface SignalJsonRpcResponse<T> {
  error?: {
    code?: number;
    message?: string;
  };
  id?: string | number | null;
  result?: T;
}

interface SignalSendResult {
  timestamp?: number;
}

interface SignalReceiveNotification {
  method?: string;
  params?: {
    account?: string;
    envelope?: SignalEnvelope;
    result?: {
      envelope?: SignalEnvelope;
    };
    subscription?: number;
  };
}

interface SignalEnvelope {
  dataMessage?: SignalDataMessage;
  source?: string;
  sourceName?: string;
  sourceNumber?: string;
  sourceUuid?: string;
  timestamp?: number;
}

interface SignalDataMessage {
  attachments?: SignalAttachment[];
  groupInfo?: {
    groupId?: string;
  };
  message?: string;
  timestamp?: number;
}

interface SignalAttachment {
  contentType?: string;
  filename?: string;
  id?: string | number;
  path?: string;
  url?: string;
}

const DEFAULT_RPC_ENDPOINT = 'http://localhost:8080/api/v1/rpc';

export function signalRpcEndpoint(config: SignalBridgeConfig): URL {
  return normalizeEndpoint(config.rpcEndpoint ?? DEFAULT_RPC_ENDPOINT);
}

export function signalEventsEndpoint(config: SignalBridgeConfig): URL {
  if (config.eventsEndpoint) return normalizeEndpoint(config.eventsEndpoint);

  const rpc = signalRpcEndpoint(config);
  if (rpc.pathname.endsWith('/rpc')) {
    rpc.pathname = rpc.pathname.replace(/\/rpc$/, '/events');
  } else {
    rpc.pathname = '/api/v1/events';
  }
  rpc.search = '';
  return rpc;
}

export function renderSignalText(msg: BridgeMessage): string {
  const network = msg.originalNetwork ?? msg.identity.network;
  const lines = [`${msg.identity.username} [${network}]: ${msg.text || '(no text)'}`];

  for (const attachment of msg.attachments ?? []) {
    lines.push(`${attachment.filename ?? attachment.kind}: ${attachment.url}`);
  }

  return lines.join('\n');
}

export function signalSendParams(channel: string, msg: BridgeMessage, config: SignalBridgeConfig): Record<string, unknown> {
  const params: Record<string, unknown> = {
    message: renderSignalText(msg),
  };

  if (config.phoneNumber) {
    params.account = config.phoneNumber;
  }

  if (isDirectSignalRecipient(channel)) {
    params.recipient = [channel];
  } else {
    params.groupId = channel;
  }

  return params;
}

export function mapSignalNotification(notification: SignalReceiveNotification, config: SignalBridgeConfig): BridgeMessage | undefined {
  if (notification.method !== 'receive') return undefined;

  const envelope = notification.params?.envelope ?? notification.params?.result?.envelope;
  if (!envelope?.dataMessage) return undefined;

  const data = envelope.dataMessage;
  const channel = data.groupInfo?.groupId ?? envelope.sourceNumber ?? envelope.source ?? envelope.sourceUuid;
  const source = envelope.sourceNumber ?? envelope.source ?? envelope.sourceUuid;
  const text = data.message ?? '';
  const attachments = signalAttachments(data.attachments ?? []);

  if (!channel || !source) return undefined;
  if (source === config.phoneNumber) return undefined;
  if (!text && attachments.length === 0) return undefined;

  return {
    id: `${source}:${data.timestamp ?? envelope.timestamp ?? Date.now()}`,
    channel,
    identity: {
      network: 'signal',
      username: envelope.sourceName || source,
    },
    text,
    attachments: attachments.length > 0 ? attachments : undefined,
    timestamp: timestampFromSignal(data.timestamp ?? envelope.timestamp),
    originalNetwork: 'signal',
  };
}

export function messagesFromSignalSse(chunk: string, config: SignalBridgeConfig): BridgeMessage[] {
  const messages: BridgeMessage[] = [];

  for (const block of chunk.split(/\n\n+/)) {
    const dataLines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim());

    if (dataLines.length === 0) continue;

    try {
      const notification = JSON.parse(dataLines.join('\n')) as SignalReceiveNotification;
      const message = mapSignalNotification(notification, config);
      if (message) messages.push(message);
    } catch {
      // Ignore keepalive or malformed SSE rows from older daemons.
    }
  }

  return messages;
}

async function signalJsonRpc<T>(
  config: SignalBridgeConfig,
  method: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const id = `sh1pt-${method}-${Date.now()}`;
  const response = await fetch(signalRpcEndpoint(config), {
    body: JSON.stringify({
      id,
      jsonrpc: '2.0',
      method,
      params,
    }),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal,
  });

  const body = await parseJsonRpcResponse<T>(response, config);
  if (body.error) {
    throw new Error(`signal-cli ${method} failed${body.error.code ? ` (${body.error.code})` : ''}: ${redactSignalError(body.error.message ?? 'unknown error', config)}`);
  }

  return body.result as T;
}

async function parseJsonRpcResponse<T>(response: Response, config: SignalBridgeConfig): Promise<SignalJsonRpcResponse<T>> {
  let body: SignalJsonRpcResponse<T>;
  try {
    body = (await response.json()) as SignalJsonRpcResponse<T>;
  } catch {
    body = { error: { message: `HTTP ${response.status}` } };
  }

  if (!response.ok) {
    const message = body.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`signal-cli request failed (${response.status}): ${redactSignalError(message, config)}`);
  }

  return body;
}

async function consumeSignalEvents(
  config: SignalBridgeConfig,
  channels: string[],
  onMessage: (msg: BridgeMessage) => Promise<void> | void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(signalEventsEndpoint(config), {
    headers: {
      Accept: 'text/event-stream',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`signal-cli events failed (${response.status})`);
  }

  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const subscribed = new Set(channels);
  let buffer = '';

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\n\n+/);
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      for (const message of messagesFromSignalSse(block, config)) {
        if (subscribed.size > 0 && !subscribed.has(message.channel)) continue;
        await onMessage(message);
      }
    }
  }
}

function requirePhoneNumber(ctx: { secret(k: string): string | undefined }, config: SignalBridgeConfig): string {
  const phoneNumber = config.phoneNumber ?? ctx.secret('SIGNAL_PHONE_NUMBER');
  if (!phoneNumber) throw new Error('SIGNAL_PHONE_NUMBER not in vault');
  return phoneNumber;
}

function normalizeEndpoint(endpoint: string): URL {
  const url = new URL(endpoint.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Signal bridge endpoint must be an http(s) URL');
  }
  return url;
}

function isDirectSignalRecipient(channel: string): boolean {
  return channel.startsWith('+') || channel.startsWith('u:');
}

function signalAttachments(attachments: SignalAttachment[]): BridgeAttachment[] {
  return attachments.flatMap((attachment) => {
    const url = attachment.url ?? attachment.path;
    if (!url) return [];

    return [{
      filename: attachment.filename ?? (attachment.id === undefined ? undefined : String(attachment.id)),
      kind: kindFromMime(attachment.contentType),
      mimeType: attachment.contentType,
      url,
    }];
  });
}

function kindFromMime(mimeType: string | undefined): BridgeAttachment['kind'] {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'file';
}

function timestampFromSignal(timestamp: number | undefined): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function redactSignalError(message: string, config: SignalBridgeConfig): string {
  const phoneNumber = config.phoneNumber;
  if (!phoneNumber) return message;
  return message.split(phoneNumber).join(redactedPhoneNumber(phoneNumber));
}

function redactedPhoneNumber(phoneNumber: string): string {
  return phoneNumber.length <= 4 ? '[redacted-phone]' : `[redacted-phone:${phoneNumber.slice(-4)}]`;
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

export default defineBridge<SignalBridgeConfig>({
  id: 'bridge-signal',
  label: 'Signal',

  async subscribe(ctx, channels, onMessage, config) {
    const phoneNumber = requirePhoneNumber(ctx, config);
    const resolvedConfig = { ...config, phoneNumber };
    const controller = linkAbortSignal(ctx.signal);
    let subscription: number | undefined;

    ctx.log(`signal bridge · ${config.runtime} · number=${redactedPhoneNumber(phoneNumber)} · channels=${channels.length}`);

    try {
      subscription = await signalJsonRpc<number>(resolvedConfig, 'subscribeReceive', { account: phoneNumber }, controller.signal);
    } catch (error) {
      ctx.log(`signal bridge subscribeReceive skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    const loop = consumeSignalEvents(resolvedConfig, channels, onMessage, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) {
          ctx.log(`signal bridge events failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

    return {
      async close() {
        controller.abort();
        if (subscription !== undefined) {
          await signalJsonRpc(resolvedConfig, 'unsubscribeReceive', { account: phoneNumber, subscription }).catch(() => undefined);
        }
        await loop;
      },
    };
  },

  async send(ctx, channel, msg, config) {
    const phoneNumber = requirePhoneNumber(ctx, config);
    const resolvedConfig = { ...config, phoneNumber };
    ctx.log(`signal bridge · send ${isDirectSignalRecipient(channel) ? 'recipient' : 'group'}=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const result = await signalJsonRpc<SignalSendResult>(resolvedConfig, 'send', signalSendParams(channel, msg, resolvedConfig));
    return { id: `signal:${result.timestamp ?? Date.now()}` };
  },

  setup: manualSetup({
    label: "Signal bridge",
    vendorDocUrl: "https://github.com/AsamK/signal-cli/blob/master/man/signal-cli-jsonrpc.5.adoc",
    steps: [
      "Install signal-cli and register or link a dedicated Signal account",
      "Run signal-cli daemon with HTTP JSON-RPC enabled, for example: signal-cli -a +12345550100 daemon --http localhost:8080",
      "Store the dedicated phone number as SIGNAL_PHONE_NUMBER or pass it in bridge config",
    ],
  }),
});
