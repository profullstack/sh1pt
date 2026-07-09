import { NextRequest, NextResponse } from 'next/server';
import {
  answerCall,
  bridgeCalls,
  createConference,
  dialCall,
  gatherOwnerDecision,
  hangupCall,
  joinConference,
  normalizeTelnyxVoiceEvent,
  parseTelnyxVoiceEvent,
  speakCall,
  startConferenceRecording,
  startRecording,
  startTranscription,
  verifyTelnyxWebhook,
} from '@/lib/telnyx-voice';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  const shouldVerify = process.env.TELNYX_VERIFY_SIGNATURE !== 'false';
  if (shouldVerify) {
    if (!publicKey) {
      return NextResponse.json({ error: 'Telnyx public key not configured' }, { status: 500 });
    }
    const verified = verifyTelnyxWebhook({
      publicKey,
      timestamp: req.headers.get('telnyx-timestamp'),
      signature: req.headers.get('telnyx-signature-ed25519'),
      rawBody,
    });
    if (!verified) {
      return NextResponse.json({ error: 'Invalid Telnyx signature' }, { status: 403 });
    }
  }

  const event = parseTelnyxVoiceEvent(rawBody);
  const normalized = normalizeTelnyxVoiceEvent(event);
  const supabase = getSupabaseServiceClient();

  const { error: eventError } = await supabase.from('telnyx_voice_events').upsert(
    {
      event_id: normalized.eventId,
      event_type: normalized.eventType,
      occurred_at: normalized.occurredAt,
      call_control_id: normalized.callControlId,
      call_session_id: normalized.callSessionId,
      call_leg_id: normalized.callLegId,
      conference_id: normalized.conferenceId,
      from_number: normalized.fromNumber,
      to_number: normalized.toNumber,
      direction: normalized.direction,
      transcript: normalized.transcript,
      payload: event,
    },
    { onConflict: 'event_id' },
  );
  if (eventError) {
    console.error('[telnyx voice webhook] event persist failed:', eventError);
    return NextResponse.json({ error: 'Failed to persist event' }, { status: 500 });
  }
  await maybePersistRecording(normalized, event, supabase);

  if (isLeadEvent(normalized.eventType)) {
    if (normalized.callSessionId) {
      const now = normalized.occurredAt ?? new Date().toISOString();
      const existing = await supabase
        .from('ai_phone_leads')
        .select('id, first_event_at, latest_transcript, metadata')
        .eq('call_session_id', normalized.callSessionId)
        .maybeSingle<{
          id: string;
          first_event_at: string;
          latest_transcript: string | null;
          metadata: Record<string, unknown> | null;
        }>();

      const lead = {
        phone_number: normalized.fromNumber ?? normalized.toNumber,
        call_session_id: normalized.callSessionId,
        first_event_at: existing.data?.first_event_at ?? now,
        last_event_at: now,
        latest_transcript: normalized.transcript ?? existing.data?.latest_transcript ?? null,
        metadata: {
          ...(existing.data?.metadata ?? {}),
          source: 'telnyx.voice',
          last_event_type: normalized.eventType,
          to_number: normalized.toNumber,
          direction: normalized.direction,
        },
        updated_at: new Date().toISOString(),
      };
      const { error: leadError } = await supabase
        .from('ai_phone_leads')
        .upsert(lead, { onConflict: 'call_session_id' });
      if (leadError) {
        console.error('[telnyx voice webhook] lead persist failed:', leadError);
      }
    }
  }

  const commandTag =
    normalized.eventId ??
    normalized.callSessionId ??
    normalized.callLegId ??
    normalized.callControlId ??
    Date.now().toString();

  try {
    if (normalized.clientState?.role === 'owner_review') {
      await handleOwnerReviewEvent(normalized, commandTag, supabase);
    } else if (normalized.clientState?.role === 'caller_bridge') {
      await handleCallerBridgeEvent(normalized, commandTag, supabase);
    } else if (normalized.callControlId && normalized.eventType === 'call.initiated') {
      await answerCall(normalized.callControlId, commandTag);
      await startTranscription(normalized.callControlId, commandTag);
      await speakCall(
        normalized.callControlId,
        process.env.TELNYX_INITIAL_PROMPT ??
          'This is sh1pt. Tell me what you want to build or deploy, and I will report it to Anthony.',
        commandTag,
      );
    } else if (
      normalized.callControlId &&
      normalized.transcript &&
      normalized.transcriptionIsFinal !== false
    ) {
      await handleInboundLeadTranscript(normalized, commandTag, supabase);
    }
  } catch (error) {
    console.error('[telnyx voice webhook] call control failed:', error);
    return NextResponse.json(
      {
        ok: true,
        warning: 'Event stored, but call control failed',
        event_type: normalized.eventType,
      },
      { status: 202 },
    );
  }

  return NextResponse.json({ ok: true, event_type: normalized.eventType });
}

async function handleInboundLeadTranscript(
  normalized: ReturnType<typeof normalizeTelnyxVoiceEvent>,
  commandTag: string,
  supabase: ReturnType<typeof getSupabaseServiceClient>,
) {
  if (!normalized.callSessionId || !normalized.fromNumber || !normalized.transcript) return;
  const ownerPhoneNumber = process.env.TELNYX_OWNER_PHONE_NUMBER;
  if (!ownerPhoneNumber) {
    await speakCall(
      normalized.callControlId!,
      'I captured that. The private callback line is not configured yet, so Anthony will follow up separately.',
      commandTag,
    );
    await hangupCall(normalized.callControlId!, commandTag);
    return;
  }

  const existing = await supabase
    .from('telnyx_voice_handoffs')
    .select('id')
    .eq('source_call_session_id', normalized.callSessionId)
    .maybeSingle<{ id: string }>();
  if (existing.data?.id) return;

  const canKeepCallerLive = canConferenceLiveCaller(normalized.eventType);
  if (canKeepCallerLive) {
    await speakCall(
      normalized.callControlId!,
      'I captured that. Stay on the line while I call Anthony.',
      commandTag,
    );
  }

  const summary = buildLeadSummary(normalized.fromNumber, normalized.transcript);
  const inserted = await supabase
    .from('telnyx_voice_handoffs')
    .insert({
      source_call_session_id: normalized.callSessionId,
      source_call_control_id: normalized.callControlId,
      original_caller_number: normalized.fromNumber,
      owner_number: ownerPhoneNumber,
      summary,
      status: canKeepCallerLive ? 'conference_requested' : 'owner_call_requested',
    })
    .select('id')
    .single<{ id: string }>();
  if (inserted.error || !inserted.data) {
    throw inserted.error ?? new Error('Failed to create Telnyx handoff');
  }

  const handoffId = inserted.data.id;
  if (canKeepCallerLive) {
    const conferenceName = `sh1pt-${handoffId}`;
    const conference = await createConference({
      callControlId: normalized.callControlId!,
      name: conferenceName,
      commandTag,
    });
    const conferenceId = conference.conferenceId ?? conference.name ?? conferenceName;
    await supabase
      .from('telnyx_voice_handoffs')
      .update({
        conference_id: conferenceId,
        status: 'conference_created',
        updated_at: new Date().toISOString(),
      })
      .eq('id', handoffId);
  }

  const ownerDial = await dialCall({
    to: ownerPhoneNumber,
    clientState: { role: 'owner_review', handoffId },
    commandTag,
  });
  await supabase
    .from('telnyx_voice_handoffs')
    .update({
      owner_call_control_id: ownerDial.callControlId,
      status: ownerDial.callControlId ? 'owner_call_dialed' : 'owner_call_requested',
      updated_at: new Date().toISOString(),
    })
    .eq('id', handoffId);
}

async function handleOwnerReviewEvent(
  normalized: ReturnType<typeof normalizeTelnyxVoiceEvent>,
  commandTag: string,
  supabase: ReturnType<typeof getSupabaseServiceClient>,
) {
  const state = normalized.clientState;
  if (state?.role !== 'owner_review' || !normalized.callControlId) return;
  const handoff = await loadHandoff(supabase, state.handoffId);
  if (!handoff) return;

  if (normalized.eventType === 'call.answered') {
    await supabase
      .from('telnyx_voice_handoffs')
      .update({
        owner_call_control_id: normalized.callControlId,
        status: 'owner_reviewing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', state.handoffId);
    await gatherOwnerDecision(
      normalized.callControlId,
      `One report from 1 report zero zero AI. ${handoff.summary} Say callback or press 1 to ${
        handoff.conference_id ? 'connect with the caller' : 'call the prospect back'
      }. Press 2 to skip.`,
      commandTag,
      state,
    );
    return;
  }

  if (normalized.eventType === 'call.gather.ended') {
    const yes = normalized.digits === '1' || /\b(callback|yes|yeah|connect|call|one)\b/i.test(normalized.speech ?? '');
    if (!yes) {
      await supabase
        .from('telnyx_voice_handoffs')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', state.handoffId);
      await speakCall(normalized.callControlId, 'Okay. I will not connect the caller.', commandTag, state);
      await hangupCall(normalized.callControlId, commandTag);
      if (handoff.source_call_control_id) {
        await speakCall(
          handoff.source_call_control_id,
          'Anthony is not available right now. He will follow up separately.',
          commandTag,
        );
        await hangupCall(handoff.source_call_control_id, commandTag);
      }
      return;
    }

    if (handoff.conference_id) {
      await supabase
        .from('telnyx_voice_handoffs')
        .update({ status: 'connecting', updated_at: new Date().toISOString() })
        .eq('id', state.handoffId);
      await speakCall(normalized.callControlId, 'Connecting you with the caller now.', commandTag, state);
      await joinConference(handoff.conference_id, normalized.callControlId, commandTag, state);
      await startConferenceRecording(handoff.conference_id, commandTag);
      await supabase
        .from('telnyx_voice_handoffs')
        .update({ status: 'bridged', updated_at: new Date().toISOString() })
        .eq('id', state.handoffId);
      return;
    }

    await supabase
      .from('telnyx_voice_handoffs')
      .update({ status: 'redial_requested', updated_at: new Date().toISOString() })
      .eq('id', state.handoffId);
    await speakCall(normalized.callControlId, 'Calling the original caller now. Please hold.', commandTag, state);
    const callerDial = await dialCall({
      to: handoff.original_caller_number,
      clientState: {
        role: 'caller_bridge',
        handoffId: state.handoffId,
        ownerCallControlId: normalized.callControlId,
      },
      commandTag,
    });
    await supabase
      .from('telnyx_voice_handoffs')
      .update({
        caller_call_control_id: callerDial.callControlId,
        status: callerDial.callControlId ? 'caller_redialed' : 'redial_requested',
        updated_at: new Date().toISOString(),
      })
      .eq('id', state.handoffId);
  }
}

async function handleCallerBridgeEvent(
  normalized: ReturnType<typeof normalizeTelnyxVoiceEvent>,
  commandTag: string,
  supabase: ReturnType<typeof getSupabaseServiceClient>,
) {
  const state = normalized.clientState;
  if (state?.role !== 'caller_bridge' || !normalized.callControlId) return;
  if (normalized.eventType !== 'call.answered') return;

  await supabase
    .from('telnyx_voice_handoffs')
    .update({
      caller_call_control_id: normalized.callControlId,
      status: 'bridging',
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.handoffId);
  await speakCall(normalized.callControlId, 'Connecting you with Anthony now.', commandTag, state);
  await startRecording(normalized.callControlId, commandTag, state);
  await bridgeCalls(normalized.callControlId, state.ownerCallControlId, commandTag, state);
  await supabase
    .from('telnyx_voice_handoffs')
    .update({ status: 'bridged', updated_at: new Date().toISOString() })
    .eq('id', state.handoffId);
}

async function loadHandoff(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  handoffId: string,
): Promise<{
  id: string;
  original_caller_number: string;
  source_call_control_id: string | null;
  conference_id: string | null;
  summary: string;
} | null> {
  const { data } = await supabase
    .from('telnyx_voice_handoffs')
    .select('id, original_caller_number, source_call_control_id, conference_id, summary')
    .eq('id', handoffId)
    .maybeSingle<{
      id: string;
      original_caller_number: string;
      source_call_control_id: string | null;
      conference_id: string | null;
      summary: string;
    }>();
  return data ?? null;
}

function buildLeadSummary(fromNumber: string, transcript: string): string {
  const compact = transcript.replace(/\s+/g, ' ').trim();
  const clipped = compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
  return `Caller ${fromNumber} said: ${clipped}`;
}

function isLeadEvent(eventType: string): boolean {
  return (
    eventType === 'call.initiated' ||
    eventType === 'call.answered' ||
    eventType === 'call.hangup' ||
    eventType.includes('transcription') ||
    eventType.includes('gather')
  );
}

function canConferenceLiveCaller(eventType: string): boolean {
  return eventType !== 'texml.call.completed' && eventType !== 'texml.call.ended';
}

async function maybePersistRecording(
  normalized: ReturnType<typeof normalizeTelnyxVoiceEvent>,
  event: ReturnType<typeof parseTelnyxVoiceEvent>,
  supabase: ReturnType<typeof getSupabaseServiceClient>,
) {
  if (normalized.eventType !== 'call.recording.saved' && normalized.eventType !== 'conference.recording.saved') return;
  const payload = event.data?.payload ?? {};
  const recordingUrl = recordingUrlFromPayload(payload);
  if (!recordingUrl) return;
  if (normalized.conferenceId) {
    await supabase
      .from('telnyx_voice_handoffs')
      .update({
        recording_url: recordingUrl,
        status: 'recorded',
        updated_at: new Date().toISOString(),
      })
      .eq('conference_id', normalized.conferenceId);
    return;
  }
  if (!normalized.callControlId) return;
  await supabase
    .from('telnyx_voice_handoffs')
    .update({
      recording_url: recordingUrl,
      status: 'recorded',
      updated_at: new Date().toISOString(),
    })
    .or(`caller_call_control_id.eq.${normalized.callControlId},owner_call_control_id.eq.${normalized.callControlId}`);
}

function recordingUrlFromPayload(payload: Record<string, unknown>): string | null {
  const direct =
    stringValue(payload.recording_url) ??
    stringValue(payload.recording_urls) ??
    stringValue(payload.public_recording_url) ??
    stringValue(payload.public_recording_urls);
  if (direct) return direct;
  const urls = payload.recording_urls ?? payload.public_recording_urls;
  if (Array.isArray(urls)) {
    return urls.find((url): url is string => typeof url === 'string') ?? null;
  }
  if (typeof urls === 'object' && urls) {
    const first = Object.values(urls).find((url): url is string => typeof url === 'string');
    if (first) return first;
  }
  return null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
