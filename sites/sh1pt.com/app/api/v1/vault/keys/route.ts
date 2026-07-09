import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSupabaseFromBearer } from '@/lib/supabase/bearer';

// GET  /api/v1/vault/keys  → returns the user's KDF parameters so the
//                            CLI can re-derive the encryption key on a
//                            fresh machine. 404 if first-run.
// POST /api/v1/vault/keys  → registers KDF parameters. Idempotent: the
//                            first POST wins; subsequent POSTs return
//                            the existing row to prevent passphrase
//                            change from silently orphaning ciphertext.
//
// We never see the passphrase or the derived key — only the salt + ops
// + mem the CLI needs to reproduce the same key from the same passphrase.

export const runtime = 'nodejs';

const DEFAULT_OPS = 2;                        // libsodium "interactive"
const DEFAULT_MEM = 64 * 1024 * 1024;         // 64 MB

export async function GET(req: Request) {
  const auth = getSupabaseFromBearer(req);
  if (!auth) return NextResponse.json({ error: 'missing_bearer' }, { status: 401 });

  const { data, error } = await auth.supabase
    .from('vault_keys')
    .select('kdf_salt, kdf_opslimit, kdf_memlimit')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'lookup_failed', detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'no_vault_yet' }, { status: 404 });

  const saltB64 = data.kdf_salt
    ? Buffer.from(data.kdf_salt as unknown as string, 'hex').toString('base64')
    : null;

  return NextResponse.json({
    kdf_salt_b64: saltB64,
    kdf_opslimit: data.kdf_opslimit,
    kdf_memlimit: data.kdf_memlimit,
  });
}

export async function POST(req: Request) {
  const auth = getSupabaseFromBearer(req);
  if (!auth) return NextResponse.json({ error: 'missing_bearer' }, { status: 401 });

  // Resolve the user from the JWT — RLS will enforce the same id on insert.
  const { data: who } = await auth.supabase.auth.getUser();
  if (!who?.user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const { data: existing } = await auth.supabase
    .from('vault_keys')
    .select('kdf_salt, kdf_opslimit, kdf_memlimit')
    .maybeSingle();
  if (existing) {
    const saltB64 = Buffer.from(existing.kdf_salt as unknown as string, 'hex').toString('base64');
    return NextResponse.json({
      kdf_salt_b64: saltB64,
      kdf_opslimit: existing.kdf_opslimit,
      kdf_memlimit: existing.kdf_memlimit,
      created: false,
    });
  }

  const salt = randomBytes(16);
  const { error: insertErr } = await auth.supabase.from('vault_keys').insert({
    user_id: who.user.id,
    kdf_salt: bytesToHex(salt),
    kdf_opslimit: DEFAULT_OPS,
    kdf_memlimit: DEFAULT_MEM,
  });
  if (insertErr) {
    return NextResponse.json({ error: 'insert_failed', detail: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    kdf_salt_b64: salt.toString('base64'),
    kdf_opslimit: DEFAULT_OPS,
    kdf_memlimit: DEFAULT_MEM,
    created: true,
  });
}

// Postgres bytea → hex literal. Supabase's PostgREST accepts \x-prefixed
// hex for bytea inserts.
function bytesToHex(b: Buffer): string {
  return `\\x${b.toString('hex')}`;
}
