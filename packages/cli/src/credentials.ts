// Persisted CLI session — written by `sh1pt login`, read by every
// command that talks to the sh1pt cloud (vault, build farm, store
// submission polling, …).
//
// File layout: ~/.config/sh1pt/credentials.json (or $XDG_CONFIG_HOME).
// Access token + refresh token come from the Supabase magic-link flow
// brokered through /api/v1/cli/{pair,claim}. We refresh inline when the
// access token is < 60s from expiry.

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const FILE_NAME = 'credentials.json';

export interface Credentials {
  access_token: string;
  refresh_token: string;
  expires_at?: number;            // unix seconds
  user?: { id?: string; email?: string };
}

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) return join(xdg, 'sh1pt');
  return join(process.env.HOME || homedir() || '.', '.config', 'sh1pt');
}

export function credentialsPath(): string {
  return join(configDir(), FILE_NAME);
}

export function apiBaseUrl(): string {
  return process.env.SH1PT_API_URL ?? 'https://sh1pt.com';
}

export async function readCredentials(): Promise<Credentials | null> {
  try {
    const raw = await fs.readFile(credentialsPath(), 'utf8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export async function writeCredentials(creds: Credentials): Promise<void> {
  const path = credentialsPath();
  // Mode 0o700 on the directory — match local-vault.ts writeVault pattern.
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Atomic write: write to a tmp file then rename, so a crash mid-write
  // never leaves credentials.json truncated/corrupt. Mirrors writeVault() in
  // local-vault.ts which holds equally sensitive data.
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(creds, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, path);
  // rename(2) preserves the source mode, but if the destination pre-existed
  // at a looser mode (e.g. 0644 from an older sh1pt build), the resulting
  // file keeps that loose mode. Explicitly tighten after rename.
  await fs.chmod(path, 0o600).catch(() => {});
}

export async function clearCredentials(): Promise<void> {
  try {
    await fs.unlink(credentialsPath());
  } catch {
    // already gone — fine
  }
}

// v1: no refresh. Supabase access tokens last 1 hour. When the API
// returns 401 the CLI tells the user to `sh1pt login` again. Refresh
// will land later via a /api/v1/cli/refresh endpoint that brokers
// against Supabase server-side, so the CLI never needs the anon key.
export async function ensureFreshAccess(creds: Credentials): Promise<Credentials | null> {
  return creds;
}
