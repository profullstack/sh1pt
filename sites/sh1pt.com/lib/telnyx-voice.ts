import 'server-only';
import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';

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
  conferenceId: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  direction: string | null;
  transcript: string | null;
  transcriptionIsFinal: boolean | null;
  digits: string | null;
  speech: string | null;
  clientState: TelnyxClientState | null;
};

const API = 'https://api.telnyx.com/v2';
const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

export type TelnyxClientState =
  | { role: 'owner_review'; handoffId: string }
  | { role: 'caller_bridge'; handoffId: string; ownerCallControlId: string };

export function parseTelnyxVoiceEvent(rawBody: string): TelnyxVoiceEvent {
  const body = rawBody.trim();
  try {
    const parsed = JSON.parse(body) as unknown;
    return typeof parsed === 'object' && parsed ? (parsed as TelnyxVoiceEvent) : {};
  } catch {
    return parseTelnyxFormEvent(stripBodyQuotes(body));
  }
}

export function normalizeTelnyxVoiceEvent(event: TelnyxVoiceEvent): NormalizedTelnyxVoiceEvent {
  const payload = event.data?.payload ?? {};
  return {
    eventId: stringValue(event.data?.id) ?? stringValue(payload.id) ?? stringValue(payload.EventId) ?? null,
    eventType: stringValue(event.data?.event_type) ?? 'unknown',
    occurredAt: stringValue(event.data?.occurred_at) ?? null,
    callControlId: stringValue(payload.call_control_id) ?? stringValue(payload.call_control_id_v2) ?? stringValue(payload.CallSid) ?? null,
    callSessionId:
      stringValue(payload.call_session_id) ??
      stringValue(payload.CallSessionSid) ??
      stringValue(payload.CallSessionId) ??
      stringValue(payload.SipHeader_X_RTC_CALLID) ??
      null,
    callLegId:
      stringValue(payload.call_leg_id) ??
      stringValue(payload.CallLegSid) ??
      stringValue(payload.CallSidLegacy) ??
      stringValue(payload.SipHeader_X_rtc_leg_uuid) ??
      null,
    conferenceId: stringValue(payload.conference_id) ?? stringValue(payload.ConferenceSid) ?? null,
    fromNumber: phoneNumber(payload.from) ?? phoneNumber(payload.From) ?? null,
    toNumber: phoneNumber(payload.to) ?? phoneNumber(payload.To) ?? null,
    direction: stringValue(payload.direction) ?? lowerString(payload.Direction) ?? null,
    transcript: transcriptText(payload) ?? null,
    transcriptionIsFinal: transcriptionIsFinal(payload),
    digits: stringValue(payload.digits) ?? null,
    speech: speechText(payload) ?? null,
    clientState: parseClientState(stringValue(payload.client_state)),
  };
}

function parseTelnyxFormEvent(rawBody: string): TelnyxVoiceEvent {
  const params = new URLSearchParams(rawBody);
  const payload = Object.fromEntries(params);
  if (!Object.keys(payload).length) return {};
  return {
    data: {
      id: formEventId(payload),
      event_type: formEventType(payload),
      occurred_at: new Date().toISOString(),
      payload,
    },
  };
}

function formEventId(payload: Record<string, string>): string | undefined {
  const callSid = payload.CallSid || payload.CallSidLegacy;
  const status = payload.CallStatus || 'unknown';
  const callId = payload.SipHeader_X_RTC_CALLID || payload['SipHeader_X-RTC-CALLID'];
  return callSid || callId ? `texml:${callSid || callId}:${status}` : undefined;
}

function formEventType(payload: Record<string, string>): string {
  const status = payload.CallStatus?.toLowerCase();
  if (formTranscript(payload) && status !== 'completed') return 'call.transcription';
  if (status === 'in-progress') return 'texml.call.answered';
  if (status === 'completed') return 'texml.call.completed';
  if (status === 'busy' || status === 'failed' || status === 'no-answer' || status === 'canceled') {
    return 'texml.call.ended';
  }
  return status ? `texml.call.${status}` : 'texml.call.status';
}

function stripBodyQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
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

export async function speakCall(
  callControlId: string,
  text: string,
  commandTag: string,
  clientState?: TelnyxClientState,
): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/speak`, {
    payload: text,
    voice: process.env.TELNYX_VOICE ?? 'female',
    command_id: commandId(commandTag, 'speak'),
    ...(clientState ? { client_state: encodeClientState(clientState) } : {}),
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

export async function gatherOwnerDecision(
  callControlId: string,
  text: string,
  commandTag: string,
  clientState: TelnyxClientState,
): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/gather_using_speak`, {
    payload: text,
    voice: process.env.TELNYX_VOICE ?? 'female',
    language: process.env.TELNYX_VOICE_LANGUAGE ?? 'en-US',
    minimum_digits: 1,
    maximum_digits: 1,
    valid_digits: '12',
    timeout_millis: Number(process.env.TELNYX_OWNER_DECISION_TIMEOUT_MS ?? 20000),
    command_id: commandId(commandTag, 'owner-gather'),
    client_state: encodeClientState(clientState),
  });
}

export async function hangupCall(callControlId: string, commandTag: string): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/hangup`, {
    command_id: commandId(commandTag, 'hangup'),
  });
}

export async function dialCall(input: {
  to: string;
  clientState: TelnyxClientState;
  commandTag: string;
}): Promise<{ callControlId: string | null; callLegId: string | null }> {
  const response = await telnyxPost<{
    data?: { call_control_id?: string; call_leg_id?: string };
  }>('/calls', {
    connection_id: requiredEnv('TELNYX_CONNECTION_ID'),
    to: input.to,
    from: requiredEnv('TELNYX_FROM_NUMBER'),
    webhook_url: `${siteUrl()}/api/webhooks/telnyx/voice`,
    webhook_url_method: 'POST',
    client_state: encodeClientState(input.clientState),
    command_id: commandId(input.commandTag, 'dial'),
  });
  return {
    callControlId: response.data?.call_control_id ?? null,
    callLegId: response.data?.call_leg_id ?? null,
  };
}

export async function bridgeCalls(
  callControlId: string,
  callControlIdToBridgeWith: string,
  commandTag: string,
  clientState: TelnyxClientState,
): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/bridge`, {
    call_control_id: callControlIdToBridgeWith,
    prevent_double_bridge: true,
    record: 'record-from-answer',
    record_channels: 'dual',
    record_format: 'mp3',
    record_track: 'both',
    command_id: commandId(commandTag, 'bridge'),
    client_state: encodeClientState(clientState),
  });
}

export async function createConference(input: {
  callControlId: string;
  name: string;
  commandTag: string;
}): Promise<{ conferenceId: string | null; name: string | null }> {
  const response = await telnyxPost<{
    data?: { id?: string; name?: string };
  }>('/conferences', {
    call_control_id: input.callControlId,
    name: input.name,
    max_participants: 3,
    beep_enabled: 'never',
    command_id: commandId(input.commandTag, 'conference-create'),
  });
  return {
    conferenceId: response.data?.id ?? null,
    name: response.data?.name ?? null,
  };
}

export async function joinConference(
  conferenceId: string,
  callControlId: string,
  commandTag: string,
  clientState?: TelnyxClientState,
): Promise<void> {
  await telnyxPost(`/conferences/${encodeURIComponent(conferenceId)}/actions/join`, {
    call_control_id: callControlId,
    beep_enabled: 'never',
    command_id: commandId(commandTag, 'conference-join'),
    ...(clientState ? { client_state: encodeClientState(clientState) } : {}),
  });
}

export async function startConferenceRecording(conferenceId: string, commandTag: string): Promise<void> {
  await telnyxPost(`/conferences/${encodeURIComponent(conferenceId)}/actions/record_start`, {
    format: 'mp3',
    channels: 'dual',
    play_beep: true,
    command_id: commandId(commandTag, 'conference-record'),
  });
}

export async function startRecording(
  callControlId: string,
  commandTag: string,
  clientState: TelnyxClientState,
): Promise<void> {
  await telnyxPost(`/calls/${encodeURIComponent(callControlId)}/actions/record_start`, {
    format: 'mp3',
    channels: 'dual',
    recording_track: 'both',
    transcription: true,
    command_id: commandId(commandTag, 'record'),
    client_state: encodeClientState(clientState),
  });
}

export function telnyxVoiceStatus() {
  return {
    apiKeySet: Boolean(process.env.TELNYX_API_KEY),
    publicKeySet: Boolean(process.env.TELNYX_PUBLIC_KEY),
    connectionIdSet: Boolean(process.env.TELNYX_CONNECTION_ID),
    fromNumberSet: Boolean(process.env.TELNYX_FROM_NUMBER),
    ownerPhoneNumberSet: Boolean(process.env.TELNYX_OWNER_PHONE_NUMBER),
    signatureVerificationDisabled: process.env.TELNYX_VERIFY_SIGNATURE === 'false',
    voice: process.env.TELNYX_VOICE ?? 'female',
    language: process.env.TELNYX_TRANSCRIPTION_LANGUAGE ?? 'en-US',
  };
}

function commandId(commandTag: string, action: string): string {
  return `sh1pt-${action}-${commandTag || randomUUID()}`.slice(0, 128);
}

async function telnyxPost<T = void>(path: string, payload: Record<string, unknown>): Promise<T> {
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
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Telnyx ${path} failed: ${response.status} ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
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
  const direct =
    stringValue(payload.transcript) ??
    stringValue(payload.Transcript) ??
    stringValue(payload.transcription) ??
    stringValue(payload.TranscriptionText) ??
    stringValue(payload.SpeechResult) ??
    stringValue(payload.summary) ??
    stringValue(payload.Summary) ??
    stringValue(payload.post_conversation_summary) ??
    stringValue(payload.PostConversationSummary);
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

function speechText(payload: Record<string, unknown>): string | undefined {
  const speech = payload.speech;
  if (isObject(speech)) return stringValue(speech.transcript) ?? stringValue(speech.text);
  return stringValue(payload.speech) ?? stringValue(payload.SpeechResult);
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

function lowerString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.toLowerCase() : undefined;
}

function formTranscript(payload: Record<string, string>): string | undefined {
  return (
    payload.transcript ||
    payload.Transcript ||
    payload.transcription ||
    payload.TranscriptionText ||
    payload.SpeechResult ||
    payload.summary ||
    payload.Summary ||
    payload.post_conversation_summary ||
    payload.PostConversationSummary ||
    undefined
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function encodeClientState(state: TelnyxClientState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
}

function parseClientState(value: string | undefined): TelnyxClientState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as unknown;
    if (!isObject(parsed) || typeof parsed.role !== 'string') return null;
    if (parsed.role === 'owner_review' && typeof parsed.handoffId === 'string') {
      return { role: 'owner_review', handoffId: parsed.handoffId };
    }
    if (
      parsed.role === 'caller_bridge' &&
      typeof parsed.handoffId === 'string' &&
      typeof parsed.ownerCallControlId === 'string'
    ) {
      return {
        role: 'caller_bridge',
        handoffId: parsed.handoffId,
        ownerCallControlId: parsed.ownerCallControlId,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} not set`);
  return value;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com').replace(/\/+$/, '');
}
