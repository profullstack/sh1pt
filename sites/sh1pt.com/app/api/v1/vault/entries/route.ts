import { NextResponse } from 'next/server';
import { getSupabaseFromBearer } from '@/lib/supabase/bearer';

// GET   /api/v1/vault/entries          → list all keys for this user
// GET   /api/v1/vault/entries?key=X    → fetch one entry's ciphertext
// POST  /api/v1/vault/entries          → upsert { key, nonce_b64, ciphertext_b64 }
// DELETE /api/v1/vault/entries?key=X   → drop one entry
//
// Plaintext NEVER reaches the server. The body always carries opaque
// nonce + ciphertext bytes the CLI produced via crypto_secretbox_easy.

export const runtime = 'nodejs';

const MAX_CIPHERTEXT_BYTES = 16 * 1024;

export async function GET(req: Request) {
  const auth = getSupabaseFromBearer(req);
  if (!auth) return NextResponse.json({ error: 'missing_bearer' }, { status: 401 });

  const url = new URL(req.url);
  const key = url.searchParams.get('key');

  if (key) {
    const { data, error } = await auth.supabase
      .from('vault_entries')
      .select('key, nonce, ciphertext, updated_at')
      .eq('key', key)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'lookup_failed', detail: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({
      key: data.key,
      nonce_b64: hexToBase64(data.nonce as unknown as string),
      ciphertext_b64: hexToBase64(data.ciphertext as unknown as string),
      updated_at: data.updated_at,
    });
  }

  const { data, error } = await auth.supabase
    .from('vault_entries')
    .select('key, updated_at')
    .order('key');
  if (error) return NextResponse.json({ error: 'lookup_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

interface PutBody {
  key?: string;
  nonce_b64?: string;
  ciphertext_b64?: string;
}

export async function POST(req: Request) {
  const auth = getSupabaseFromBearer(req);
  if (!auth) return NextResponse.json({ error: 'missing_bearer' }, { status: 401 });

  const { data: who } = await auth.supabase.auth.getUser();
  if (!who?.user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const key = body.key?.trim();
  const nonceB64 = body.nonce_b64;
  const ctB64 = body.ciphertext_b64;
  if (!key || !nonceB64 || !ctB64) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (key.length > 200) return NextResponse.json({ error: 'key_too_long' }, { status: 400 });
  if (Buffer.byteLength(ctB64, 'base64') > MAX_CIPHERTEXT_BYTES) {
    return NextResponse.json({ error: 'ciphertext_too_large' }, { status: 413 });
  }

  const nonceHex = base64ToHexBytea(nonceB64);
  const ctHex = base64ToHexBytea(ctB64);

  const { error } = await auth.supabase.from('vault_entries').upsert({
    user_id: who.user.id,
    key,
    nonce: nonceHex,
    ciphertext: ctHex,
  });
  if (error) {
    return NextResponse.json({ error: 'upsert_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = getSupabaseFromBearer(req);
  if (!auth) return NextResponse.json({ error: 'missing_bearer' }, { status: 401 });

  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'missing_key' }, { status: 400 });

  const { error } = await auth.supabase.from('vault_entries').delete().eq('key', key);
  if (error) return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Postgres returns bytea as `\x<hex>`; PostgREST returns a hex string with
// the leading "\x" stripped depending on encoding. We normalize both ways.
function hexToBase64(hex: string): string {
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex;
  return Buffer.from(clean, 'hex').toString('base64');
}

function base64ToHexBytea(b64: string): string {
  return `\\x${Buffer.from(b64, 'base64').toString('hex')}`;
}
