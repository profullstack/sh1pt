import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

// CLI polls this with the device_code it got from /pair. While the
// pairing is unapproved we 404 ("authorization_pending"). Once the
// user has clicked Approve on /cli/login, we mint a fresh signed-in
// session for them and hand back the access + refresh tokens. The
// CLI then writes those to ~/.config/sh1pt/credentials.json.
//
// We do NOT return the long-lived JWT directly from the user's browser
// session (that lives in cookies and refreshing it from the server
// requires the magic-link flow). Instead, on approval we generate a
// magic link for the user and exchange the recovery token here so the
// CLI gets its own session decoupled from the browser.

export const runtime = 'nodejs';

interface ClaimBody {
  device_code?: string;
}

export async function POST(req: Request) {
  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const deviceCode = body.device_code?.trim();
  if (!deviceCode) {
    return NextResponse.json({ error: 'missing_device_code' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  const { data: pair, error: lookupErr } = await supabase
    .from('cli_pairings')
    .select('device_code, user_id, approved_at, expires_at')
    .eq('device_code', deviceCode)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: 'lookup_failed', detail: lookupErr.message }, { status: 500 });
  }
  if (!pair) {
    return NextResponse.json({ error: 'unknown_device_code' }, { status: 404 });
  }
  if (new Date(pair.expires_at).getTime() < Date.now()) {
    await supabase.from('cli_pairings').delete().eq('device_code', deviceCode);
    return NextResponse.json({ error: 'expired_token' }, { status: 410 });
  }
  if (!pair.user_id || !pair.approved_at) {
    return NextResponse.json({ error: 'authorization_pending' }, { status: 202 });
  }

  // Approved. Mint a session for the user via the admin API, then burn
  // the pairing row so the same device_code can't claim twice.
  const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(pair.user_id);
  if (userErr || !userRes?.user?.email) {
    return NextResponse.json({ error: 'user_lookup_failed', detail: userErr?.message }, { status: 500 });
  }
  const email = userRes.user.email;

  // generateLink(type=magiclink) returns hashed_token + verification_url;
  // we exchange the hashed_token for a session via verifyOtp on the
  // anon client so the response carries access + refresh tokens.
  const { data: linkRes, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkRes?.properties?.hashed_token) {
    return NextResponse.json({ error: 'link_failed', detail: linkErr?.message }, { status: 500 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sess, error: verifyErr } = await anonClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkRes.properties.hashed_token,
  });
  if (verifyErr || !sess?.session) {
    return NextResponse.json({ error: 'session_failed', detail: verifyErr?.message }, { status: 500 });
  }

  await supabase.from('cli_pairings').delete().eq('device_code', deviceCode);

  return NextResponse.json({
    access_token: sess.session.access_token,
    refresh_token: sess.session.refresh_token,
    expires_at: sess.session.expires_at,
    user: { id: sess.user?.id, email: sess.user?.email },
  });
}
