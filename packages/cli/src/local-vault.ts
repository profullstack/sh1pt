// Local persistent vault for CLI secrets.
//
// Plaintext JSON at ~/.config/sh1pt/secrets.json, mode 0600. Same threat
// model as ~/.aws/credentials, ~/.netrc, ~/.docker/config.json — root +
// user can read; everyone else cannot. Encrypted vault still ships via
// cloud-vault.ts when signed in; this is the always-available fallback
// so secrets actually persist across CLI invocations.
//
// Public API:
//   loadLocalVaultSync()      — sync read at SetupContext construction
//   setSecretInLocal(k, v)    — atomic write-through (tmp + rename)
//   getSecretFromLocal(k)     — async read of one key
//   deleteSecretFromLocal(k)  — atomic remove
//   listSecretsLocal()        — keys only, never values

import { promises as fs, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { configDir } from '@profullstack/sh1pt-core';

// In-process serialization lock for read-modify-write operations.
// Prevents concurrent setSecretInLocal / deleteSecretFromLocal calls
// (e.g. from Promise.all over multiple adapter setups) from silently
// overwriting each other's writes. Each mutation acquires this before
// reading, modifies the in-memory snapshot, writes, then releases.
let _vaultLock: Promise<void> = Promise.resolve();
function withVaultLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = _vaultLock.then(fn, fn);
  // Reset the chain tail so the lock doesn't grow unbounded.
  _vaultLock = next.then(
    () => {},
    () => {},
  );
  return next;
}

const VAULT_VERSION = 1;

interface LocalVault {
  version: number;
  secrets: Record<string, string>;
}

export function localVaultPath(): string {
  return path.join(configDir(), 'secrets.json');
}

function normalizeSecrets(value: unknown): Record<string, string> {
  const secrets: Record<string, string> = {};
  if (!value || typeof value !== 'object') return secrets;
  for (const [key, secret] of Object.entries(value)) {
    if (typeof secret === 'string') secrets[key] = secret;
  }
  return secrets;
}

// Sync read for SetupContext init. Returns empty map on missing file.
// Warns once if the file is world/group-readable.
export function loadLocalVaultSync(): Map<string, string> {
  const out = new Map<string, string>();
  const file = localVaultPath();
  try {
    const stat = statSync(file);
    if ((stat.mode & 0o077) !== 0) {
      console.warn(
        `⚠ ${file} has loose permissions (mode ${(stat.mode & 0o777).toString(8)}). ` +
        `Run: chmod 600 "${file}"`,
      );
    }
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalVault>;
    for (const [k, v] of Object.entries(normalizeSecrets(parsed.secrets))) {
      out.set(k, v);
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`⚠ couldn't read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

async function readVault(): Promise<LocalVault> {
  try {
    const raw = await fs.readFile(localVaultPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalVault>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : VAULT_VERSION,
      secrets: normalizeSecrets(parsed.secrets),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: VAULT_VERSION, secrets: {} };
    }
    throw err;
  }
}

async function writeVault(v: LocalVault): Promise<void> {
  const file = localVaultPath();
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // Include pid + a random suffix so concurrent writers never share a tmp
  // filename and stomp each other's in-progress write.
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(v, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, file);
  // rename preserves the source mode, but be explicit if the destination
  // pre-existed with looser perms.
  await fs.chmod(file, 0o600).catch(() => {});
}

export async function setSecretInLocal(key: string, value: string): Promise<void> {
  // Serialize through the in-process lock to prevent concurrent
  // read-modify-write races (e.g. Promise.all over multiple adapter setups)
  // from silently dropping each other's writes.
  return withVaultLock(async () => {
    const v = await readVault();
    v.secrets[key] = value;
    await writeVault(v);
  });
}

export async function getSecretFromLocal(key: string): Promise<string | undefined> {
  const v = await readVault();
  return v.secrets[key];
}

export async function deleteSecretFromLocal(key: string): Promise<boolean> {
  return withVaultLock(async () => {
    const v = await readVault();
    if (!(key in v.secrets)) return false;
    delete v.secrets[key];
    await writeVault(v);
    return true;
  });
}

export async function listSecretsLocal(): Promise<Array<{ key: string }>> {
  const v = await readVault();
  return Object.keys(v.secrets).map((key) => ({ key }));
}
