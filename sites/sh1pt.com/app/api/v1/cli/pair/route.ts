import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

// CLI starts the device-code dance. Anonymous — no auth required.
//
// Returns:
//   device_code  — long random opaque token; CLI keeps this secret and
//                  sends it back to /claim. Acts like a pre-token.
//   user_code    — short human code; user types this on /cli/login.
//   expires_in   — seconds until the pairing row expires (10 min).
//
// We do not return any user-identifying info — the row is unowned until
// the user approves on /cli/login.

export const runtime = 'nodejs';

function userCode(): string {
  // 8 chars, base32-style alphabet (no easily-confused chars).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  // Hyphenate halfway for readability: "ABCD-2F7H"
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export async function POST() {
  const deviceCode = randomBytes(32).toString('base64url');
  const code = userCode();

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from('cli_pairings').insert({
    device_code: deviceCode,
    user_code: code,
  });
  if (error) {
    return NextResponse.json({ error: 'pair_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({
    device_code: deviceCode,
    user_code: code,
    verification_url: 'https://sh1pt.com/cli/login',
    expires_in: 600,
    interval: 3,
  });
}
