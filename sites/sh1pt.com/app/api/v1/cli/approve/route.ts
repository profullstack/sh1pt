import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

// Called from /cli/login (the in-browser page) after the signed-in
// user enters the user_code their CLI showed them. We resolve the
// pairing via service role and stamp it with the user's id + an
// approved_at timestamp. The CLI's poll on /api/v1/cli/claim then
// flips from "pending" to "ok, here's a session".

export const runtime = 'nodejs';

interface ApproveBody {
  user_code?: string;
}

export async function POST(req: Request) {
  let body: ApproveBody;
  try {
    body = (await req.json()) as ApproveBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const userCode = body.user_code?.trim().toUpperCase();
  if (!userCode) {
    return NextResponse.json({ error: 'missing_user_code' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: who } = await supabase.auth.getUser();
  if (!who?.user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const svc = getSupabaseServiceClient();
  const { data: pair, error: lookupErr } = await svc
    .from('cli_pairings')
    .select('device_code, user_id, approved_at, expires_at')
    .eq('user_code', userCode)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: 'lookup_failed', detail: lookupErr.message }, { status: 500 });
  }
  if (!pair) {
    return NextResponse.json({ error: 'unknown_code' }, { status: 404 });
  }
  if (new Date(pair.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }
  if (pair.user_id && pair.approved_at) {
    return NextResponse.json({ error: 'already_approved' }, { status: 409 });
  }

  const { error: updateErr } = await svc
    .from('cli_pairings')
    .update({ user_id: who.user.id, approved_at: new Date().toISOString() })
    .eq('user_code', userCode);

  if (updateErr) {
    return NextResponse.json({ error: 'approve_failed', detail: updateErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
