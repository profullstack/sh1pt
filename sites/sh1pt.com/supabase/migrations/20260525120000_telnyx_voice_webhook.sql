-- Telnyx Voice API webhook storage for the phone-based AI assistant.
-- The webhook route verifies Telnyx Ed25519 signatures, stores every
-- call-control event for audit/debugging, and rolls call sessions up
-- into lead records.

create table if not exists public.telnyx_voice_events (
  id uuid default gen_random_uuid() primary key,
  event_id text unique,
  event_type text not null,
  occurred_at timestamptz,
  call_control_id text,
  call_session_id text,
  call_leg_id text,
  from_number text,
  to_number text,
  direction text,
  transcript text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_telnyx_voice_events_created_at
  on public.telnyx_voice_events (created_at desc);
create index if not exists idx_telnyx_voice_events_call_session
  on public.telnyx_voice_events (call_session_id);
create index if not exists idx_telnyx_voice_events_from_number
  on public.telnyx_voice_events (from_number);
create index if not exists idx_telnyx_voice_events_event_type
  on public.telnyx_voice_events (event_type);

alter table public.telnyx_voice_events enable row level security;

drop policy if exists "Service role full access on telnyx_voice_events"
  on public.telnyx_voice_events;
create policy "Service role full access on telnyx_voice_events"
  on public.telnyx_voice_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.ai_phone_leads (
  id uuid default gen_random_uuid() primary key,
  phone_number text,
  call_session_id text unique,
  first_event_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  latest_transcript text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_phone_leads_phone_number
  on public.ai_phone_leads (phone_number);
create index if not exists idx_ai_phone_leads_last_event_at
  on public.ai_phone_leads (last_event_at desc);

alter table public.ai_phone_leads enable row level security;

drop policy if exists "Service role full access on ai_phone_leads"
  on public.ai_phone_leads;
create policy "Service role full access on ai_phone_leads"
  on public.ai_phone_leads
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
