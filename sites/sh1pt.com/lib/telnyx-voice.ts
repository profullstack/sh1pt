import 'server-only';
import { createHmac, createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';

export type TelnyxVoiceEvent = {
  data?: {
    id?: string;
    event_type?: string;
    occurred_at?: string;
    payload?: Record<string, unknown>;
  };
};

export type NormalizedTelnyxVoiceEvent = {
  eventId: string | null;
  eventType: string;
  occurredAt: string | null;
  callControlId: string | null;
  callSessionId: string | null;
  callLegId: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  direction: string | null;
  transcript: string | null;
  transcriptionIsFinal: boolean | null;
};

const API = 'https://api.telnyx.com/v2';
const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

export function parseTelnyxVoiceEvent(rawBody: string): TelnyxVoiceEvent {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return typeof parsed === 'object' && parsed ? (parsed as TelnyxVoiceEvent) : {};
  } catch {
    return {};
  }
}

export function normalizeTelnyxVoiceEvent(event: TelnyxVoiceEvent): NormalizedTelnyxVoiceEvent {
  const payload = event.data?.payload ?? {};
  return {
    eventId: stringValue(event.data?.id) ?? stringValue(payload.id) ?? null,
    eventType: stringValue(event.data?.event_type) ?? 'unknown',
    occurredAt: stringValue(event.data?.occurred_at) ?? null,
    callControlId: stringValue(payload.call_control_id) ?? stringValue(payload.call_control_id_v2) ?? null,
    callSessionId: stringValue(payload.call_session_id) ?? null,
    callLegId: stringValue(payload.call_leg_id) ?? null,
    fromNumber: phoneNumber(payload.from) ?? null,
    toNumber: phoneNumber(payload.to) ?? null,
    direction: stringValue(payload.direction) ?? null,
    transcript: transcriptText(payload) ?? null,
    transcriptionIsFinal: transcriptionIsFinal(payload),
  };
}

export function verifyTelnyxWebhook(input: {
  publicKey: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  toleranceSeconds?: number;
}): boolean {
  if (!input.timestamp || !input.signature) return false;
  if (!validTimestamp(input.timestamp, input.toleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS)) {
    return false;
  }
  try {
    const key = telnyxPublicKey(input.publicKey);
    const signature = Buffer.from(input.signature, 'base64');
    return verifySignature(null, Buffer.from(`${input.timestamp}|${input.rawBody}`), key, signature);
  } catch {
    return false;
  }
}

export async function answerCall(callControlId: string, commandTag: string): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/answer`, {
    command_id: commandId(commandTag, 'answer'),
  });
}

export async function speakCall(callControlId: string, text: string, commandTag: string): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/speak`, {
    payload: text,
    voice: process.env.TELNYX_VOICE ?? 'female',
    command_id: commandId(commandTag, 'speak'),
  });
}

export async function startTranscription(callControlId: string, commandTag: string): Promise<void> {
  const language = process.env.TELNYX_TRANSCRIPTION_LANGUAGE ?? 'en-US';
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/transcription_start`, {
    transcription_engine: process.env.TELNYX_TRANSCRIPTION_ENGINE ?? 'Google',
    transcription_engine_config: {
      language,
    },
    transcription_tracks: process.env.TELNYX_TRANSCRIPTION_TRACKS ?? 'inbound',
    command_id: commandId(commandTag, 'transcription-start'),
  });
}

export async function gatherUsingSpeak(callControlId: string, text: string, commandTag: string): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/gather_using_speak`, {
    payload: text,
    voice: process.env.TELNYX_VOICE ?? 'female',
    language: process.env.TELNYX_VOICE_LANGUAGE ?? 'en-US',
    maximum_digits: 0,
    valid_digits: '',
    timeout_millis: Number(process.env.TELNYX_GATHER_TIMEOUT_MS ?? 8000),
    inter_digit_timeout_millis: Number(process.env.TELNYX_GATHER_INTER_DIGIT_TIMEOUT_MS ?? 3000),
    command_id: commandId(commandTag, 'gather'),
  });
}

export async function hangupCall(callControlId: string, commandTag: string): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/hangup`, {
    command_id: commandId(commandTag, 'hangup'),
  });
}

export async function forwardToAssistant(input: {
  event: TelnyxVoiceEvent;
  normalized: NormalizedTelnyxVoiceEvent;
  rawBody: string;
}): Promise<{ replyText?: string; gather?: boolean; closeCall?: boolean } | null> {
  const url = process.env.TELNYX_ASSISTANT_WEBHOOK_URL;
  if (!url) return null;

  const body = JSON.stringify({
    source: 'telnyx.voice',
    normalized: input.normalized,
    event: input.event,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const secret = process.env.TELNYX_ASSISTANT_WEBHOOK_SECRET;
  if (secret) {
    headers['x-sh1pt-signature'] = createHmac('sha256', secret).update(body).digest('hex');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });
  if (!response.ok) {
    throw new Error(`Assistant webhook failed with ${response.status}`);
  }
  const data = (await response.json().catch(() => null)) as unknown;
  if (!isObject(data)) return null;
  return {
    replyText: stringValue(data.replyText) ?? stringValue(data.reply) ?? undefined,
    gather: typeof data.gather === 'boolean' ? data.gather : undefined,
    closeCall: typeof data.closeCall === 'boolean' ? data.closeCall : undefined,
  };
}

export function telnyxVoiceStatus() {
  return {
    apiKeySet: Boolean(process.env.TELNYX_API_KEY),
    publicKeySet: Boolean(process.env.TELNYX_PUBLIC_KEY),
    signatureVerificationDisabled: process.env.TELNYX_VERIFY_SIGNATURE === 'false',
    assistantWebhookSet: Boolean(process.env.TELNYX_ASSISTANT_WEBHOOK_URL),
    assistantWebhookSigningSet: Boolean(process.env.TELNYX_ASSISTANT_WEBHOOK_SECRET),
    voice: process.env.TELNYX_VOICE ?? 'female',
    language: process.env.TELNYX_TRANSCRIPTION_LANGUAGE ?? 'en-US',
  };
}

function commandId(commandTag: string, action: string): string {
  return `sh1pt-${action}-${commandTag || randomUUID()}`.slice(0, 128);
}

async function telnyxPost(path: string, payload: Record<string, unknown>): Promise<void> {
  const token = process.env.TELNYX_API_KEY;
  if (!token) throw new Error('TELNYX_API_KEY not set');
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telnyx ${path} failed: ${response.status} ${text.slice(0, 300)}`);
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

function transcriptText(payload: Record<string, unknown>): string | undefined {
  const direct = stringValue(payload.transcript) ?? stringValue(payload.transcription);
  if (direct) return direct;
  const result = payload.result;
  if (isObject(result)) {
    const resultTranscript = stringValue(result.transcript) ?? stringValue(result.text);
    if (resultTranscript) return resultTranscript;
  }
  const speech = payload.speech;
  if (isObject(speech)) {
    const speechTranscript = stringValue(speech.transcript) ?? stringValue(speech.text);
    if (speechTranscript) return speechTranscript;
  }
  const data = payload.transcription_data;
  if (isObject(data)) return stringValue(data.transcript);
}

function transcriptionIsFinal(payload: Record<string, unknown>): boolean | null {
  const data = payload.transcription_data;
  if (!isObject(data)) return null;
  return typeof data.is_final === 'boolean' ? data.is_final : null;
}

function phoneNumber(value: unknown): string | undefined {
  if (isObject(value)) {
    return stringValue(value.phone_number) ?? stringValue(value.number);
  }
  return stringValue(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
