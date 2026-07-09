// Shared SetupContext for every CLI-driven adapter setup.
//
// Storage layers, write order: local file → cloud (best-effort if signed in).
// Read order: memCache → process.env (falls back through local-loaded entries
// pre-populated into memCache at construction).
//
// Local file (`~/.config/sh1pt/secrets.json`, mode 0600) is the always-on
// persistence layer — secrets survive across CLI invocations even offline.
// Cloud vault (encrypted via libsodium) syncs on top when `sh1pt login`
// has succeeded; the server only ever sees ciphertext.

import kleur from 'kleur';
import prompts from 'prompts';
import type { SetupContext, SetupPromptDef } from '@profullstack/sh1pt-core';
import {
  getSecretFromCloud,
  isSignedIn,
  setSecretInCloud,
} from './cloud-vault.js';
import {
  loadLocalVaultSync,
  setSecretInLocal,
} from './local-vault.js';

export function makeCliSetupContext(): SetupContext {
  // Per-process cache so a single setup() that reads/writes the same key
  // doesn't re-hit disk or the network. Pre-populated from the local
  // vault so adapter `connect()` calls in a fresh process find their
  // saved secrets without a setup() round-trip.
  const memCache = new Map<string, string>(loadLocalVaultSync());
  let signedInPromise: Promise<boolean> | null = null;

  async function authedOnce(): Promise<boolean> {
    if (!signedInPromise) signedInPromise = isSignedIn();
    return signedInPromise;
  }

  return {
    secret: (key) => {
      // Synchronous read — memCache holds local-vault entries (pre-loaded
      // at construction) and any setSecret() calls from this session.
      // process.env is the final fallback for ad-hoc dev / one-shot env
      // overrides without touching the vault.
      return memCache.get(key) ?? process.env[key];
    },
    async setSecret(key, value) {
      memCache.set(key, value);
      process.env[key] = value;

      // Local persistence first — guarantees the secret survives the
      // process even if cloud / network is unavailable.
      try {
        await setSecretInLocal(key, value);
        console.log(kleur.dim(`  ✓ ${key} → ~/.config/sh1pt/secrets.json`));
      } catch (err) {
        console.log(kleur.yellow(`  ⚠ local vault write failed (${err instanceof Error ? err.message : 'unknown'}). Kept in process memory only.`));
      }

      // Best-effort cloud sync when signed in.
      if (await authedOnce()) {
        try {
          await setSecretInCloud(key, value);
          console.log(kleur.dim(`  ✓ ${key} encrypted → sh1pt.com vault`));
        } catch (err) {
          console.log(kleur.dim(`  · cloud sync skipped (${err instanceof Error ? err.message : 'unknown'}); local copy is authoritative`));
        }
      }
    },
    log: (m) => console.log(m),
    async prompt<T>(def: SetupPromptDef<T>): Promise<T> {
      const promptType =
        def.type === 'confirm' ? 'confirm' :
        def.type === 'select' ? 'select' :
        def.type === 'password' ? 'password' :
        'text';
      const res = await prompts({
        type: promptType as 'text' | 'password' | 'confirm' | 'select',
        name: 'v',
        message: def.message,
        initial: def.initial as unknown as string | number | boolean,
        choices: def.choices?.map((c) => ({ title: c.title, value: c.value })) as prompts.Choice[] | undefined,
        validate: def.validate
          ? (v: unknown) => {
              const r = def.validate!(v as T);
              return r === true ? true : r;
            }
          : undefined,
      });
      return res.v as T;
    },
    async open(url) {
      console.log(kleur.dim(`  → ${url}`));
    },
  };
}

// Async helper for the rare case an adapter wants to *load* an existing
// cloud secret during setup() (e.g. detect "already configured"). Not on
// the SetupContext interface; adapters import it directly when needed.
export async function readCloudSecret(key: string): Promise<string | undefined> {
  if (!(await isSignedIn())) return undefined;
  try {
    return await getSecretFromCloud(key);
  } catch {
    return undefined;
  }
}
