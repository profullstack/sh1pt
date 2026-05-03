// Client-side encrypted vault for sh1pt cloud secrets.
//
// Plaintext NEVER leaves the machine. Flow:
//
//   1. User signs in (`sh1pt login`) — access_token written locally.
//   2. First time we need to encrypt: prompt for a vault passphrase.
//      The passphrase is held in process memory only, never persisted.
//   3. Fetch the user's KDF parameters from /api/v1/vault/keys (or POST
//      to mint them on first use). Salt + ops + memlimit are public —
//      the passphrase is the secret.
//   4. Derive a 32-byte XSalsa20 key via Argon2id (libsodium crypto_pwhash).
//   5. Encrypt the secret with crypto_secretbox_easy (XSalsa20-Poly1305)
//      using a fresh 24-byte nonce. Upload { key, nonce_b64, ciphertext_b64 }.
//   6. Decrypt path is symmetric — fetch ciphertext+nonce, secretbox_open.
//
// The server stores opaque bytes. RLS scopes by user_id. A stolen
// service-role key still can't decrypt secrets — the passphrase isn't there.

import { createRequire } from 'node:module';
import prompts from 'prompts';
import kleur from 'kleur';
import { apiBaseUrl, ensureFreshAccess, readCredentials, type Credentials } from './credentials.js';

// libsodium-wrappers ships a broken ESM build (its modules-esm/ entrypoint
// references a sibling that isn't included in the npm tarball). The CJS
// entry is intact, so we load via createRequire and avoid the ESM path.
type Sodium = typeof import('libsodium-wrappers');
const sodium = createRequire(import.meta.url)('libsodium-wrappers') as Sodium;

let cachedKey: Uint8Array | null = null;

async function ensureSodium(): Promise<void> {
  await sodium.ready;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<{ res: Response; creds: Credentials } | null> {
  const stored = await readCredentials();
  if (!stored) return null;
  const fresh = await ensureFreshAccess(stored);
  const creds = fresh ?? stored;

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${creds.access_token}`);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
  return { res, creds };
}

// Fetch (or initialize) the user's KDF parameters. Returns salt + ops + mem.
async function getOrInitKdf(): Promise<{ salt: Uint8Array; ops: number; mem: number }> {
  const get = await authedFetch('/api/v1/vault/keys');
  if (!get) throw new Error('Not signed in. Run `sh1pt login` first.');

  if (get.res.ok) {
    const body = (await get.res.json()) as { kdf_salt_b64: string; kdf_opslimit: number; kdf_memlimit: number };
    return {
      salt: sodium.from_base64(body.kdf_salt_b64, sodium.base64_variants.ORIGINAL),
      ops: body.kdf_opslimit,
      mem: body.kdf_memlimit,
    };
  }
  if (get.res.status === 404) {
    const post = await authedFetch('/api/v1/vault/keys', { method: 'POST', body: JSON.stringify({}) });
    if (!post || !post.res.ok) {
      const detail = post ? await post.res.text() : 'no auth';
      throw new Error(`Couldn't initialize vault: ${detail}`);
    }
    const body = (await post.res.json()) as { kdf_salt_b64: string; kdf_opslimit: number; kdf_memlimit: number };
    return {
      salt: sodium.from_base64(body.kdf_salt_b64, sodium.base64_variants.ORIGINAL),
      ops: body.kdf_opslimit,
      mem: body.kdf_memlimit,
    };
  }
  const detail = await get.res.text();
  throw new Error(`vault/keys failed: ${get.res.status} ${detail}`);
}

// Derive (and cache) the XSalsa20 key. Prompts for a passphrase on
// first call; subsequent calls in the same process reuse the derived
// key in memory.
export async function getVaultKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  await ensureSodium();
  const kdf = await getOrInitKdf();

  const isFirstRun = await isFirstRunForUser();
  const passphrase = await prompts({
    type: 'password',
    name: 'p',
    message: isFirstRun
      ? 'Set a vault passphrase (will be required to read your secrets — no recovery if lost):'
      : 'Vault passphrase:',
    validate: (v: string) => (v && v.length >= 8) || 'Passphrase must be at least 8 characters.',
  });
  if (!passphrase.p) {
    throw new Error('No passphrase entered.');
  }

  console.log(kleur.dim('  deriving key (Argon2id)…'));
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    passphrase.p,
    kdf.salt,
    kdf.ops,
    kdf.mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  cachedKey = key;
  return key;
}

// First-run heuristic: no entries yet means the user is setting up for
// the first time and we should treat the passphrase prompt as "create".
async function isFirstRunForUser(): Promise<boolean> {
  const list = await authedFetch('/api/v1/vault/entries');
  if (!list || !list.res.ok) return true;
  try {
    const body = (await list.res.json()) as { entries?: Array<{ key: string }> };
    return (body.entries?.length ?? 0) === 0;
  } catch {
    return true;
  }
}

export async function setSecretInCloud(key: string, value: string): Promise<void> {
  await ensureSodium();
  const k = await getVaultKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(sodium.from_string(value), nonce, k);

  const payload = {
    key,
    nonce_b64: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    ciphertext_b64: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
  };
  const res = await authedFetch('/api/v1/vault/entries', { method: 'POST', body: JSON.stringify(payload) });
  if (!res || !res.res.ok) {
    const detail = res ? await res.res.text() : 'no auth';
    throw new Error(`vault put failed: ${detail}`);
  }
}

export async function getSecretFromCloud(key: string): Promise<string | undefined> {
  await ensureSodium();
  const res = await authedFetch(`/api/v1/vault/entries?key=${encodeURIComponent(key)}`);
  if (!res) return undefined;
  if (res.res.status === 404) return undefined;
  if (!res.res.ok) {
    const detail = await res.res.text();
    throw new Error(`vault get failed: ${detail}`);
  }
  const body = (await res.res.json()) as { nonce_b64: string; ciphertext_b64: string };
  const k = await getVaultKey();
  const nonce = sodium.from_base64(body.nonce_b64, sodium.base64_variants.ORIGINAL);
  const ciphertext = sodium.from_base64(body.ciphertext_b64, sodium.base64_variants.ORIGINAL);
  try {
    const plain = sodium.crypto_secretbox_open_easy(ciphertext, nonce, k);
    return sodium.to_string(plain);
  } catch {
    throw new Error('Decrypt failed — wrong passphrase, or this secret was encrypted with a different key.');
  }
}

export async function listSecretsFromCloud(): Promise<Array<{ key: string; updated_at: string }>> {
  const res = await authedFetch('/api/v1/vault/entries');
  if (!res || !res.res.ok) return [];
  const body = (await res.res.json()) as { entries?: Array<{ key: string; updated_at: string }> };
  return body.entries ?? [];
}

export async function deleteSecretFromCloud(key: string): Promise<void> {
  const res = await authedFetch(`/api/v1/vault/entries?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  if (!res || !res.res.ok) {
    const detail = res ? await res.res.text() : 'no auth';
    throw new Error(`vault delete failed: ${detail}`);
  }
}

export async function isSignedIn(): Promise<boolean> {
  const c = await readCredentials();
  return !!c?.access_token;
}
