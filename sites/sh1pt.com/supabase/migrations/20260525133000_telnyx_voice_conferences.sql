-- Track Telnyx conference IDs for live caller-to-owner callback handoffs.

alter table public.telnyx_voice_events
  add column if not exists conference_id text;

create index if not exists idx_telnyx_voice_events_conference_id
  on public.telnyx_voice_events (conference_id);

alter table public.telnyx_voice_handoffs
  add column if not exists conference_id text;

create index if not exists idx_telnyx_voice_handoffs_conference_id
  on public.telnyx_voice_handoffs (conference_id);
