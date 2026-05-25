import { NextRequest, NextResponse } from 'next/server';
import {
  answerCall,
  forwardToAssistant,
  hangupCall,
  normalizeTelnyxVoiceEvent,
  parseTelnyxVoiceEvent,
  speakCall,
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
    if (normalized.callControlId && normalized.eventType === 'call.initiated') {
      await answerCall(normalized.callControlId, commandTag);
      await startTranscription(normalized.callControlId, commandTag);
      await speakCall(
        normalized.callControlId,
        process.env.TELNYX_INITIAL_PROMPT ?? 'Thanks for calling sh1pt. Tell me what you want to build or deploy.',
        commandTag,
      );
    } else if (
      normalized.callControlId &&
      normalized.transcript &&
      normalized.transcriptionIsFinal !== false
    ) {
      const assistant = await forwardToAssistant({ event, normalized, rawBody });
      if (assistant?.replyText) {
        await speakCall(normalized.callControlId, assistant.replyText, commandTag);
      }
      if (assistant?.closeCall) {
        await hangupCall(normalized.callControlId, commandTag);
      }
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

function isLeadEvent(eventType: string): boolean {
  return (
    eventType === 'call.initiated' ||
    eventType === 'call.answered' ||
    eventType === 'call.hangup' ||
    eventType.includes('transcription') ||
    eventType.includes('gather')
  );
}
