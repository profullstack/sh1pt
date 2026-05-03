// Shared SetupContext for every CLI-driven adapter setup.
//
// When the user is signed in (`sh1pt login` succeeded), setSecret writes
// through the encrypted cloud vault — the server only sees ciphertext.
// secret() reads decrypt-on-demand: the first miss triggers a passphrase
// prompt, the derived key is cached for the rest of the process.
//
// When the user is NOT signed in, we fall back to in-process memory +
// process.env. That's enough to drive a one-shot setup → connect → post
// run from a single shell session, but the secrets evaporate on exit.

import kleur from 'kleur';
import prompts from 'prompts';
import type { SetupContext, SetupPromptDef } from '@profullstack/sh1pt-core';
import {
  getSecretFromCloud,
  isSignedIn,
  setSecretInCloud,
} from './cloud-vault.js';

export function makeCliSetupContext(): SetupContext {
  // Per-process cache so a single setup() that reads/writes the same key
  // doesn't re-hit the network.
  const memCache = new Map<string, string>();
  let signedInPromise: Promise<boolean> | null = null;

  async function authedOnce(): Promise<boolean> {
    if (!signedInPromise) signedInPromise = isSignedIn();
    return signedInPromise;
  }

  return {
    secret: (key) => {
      // Synchronous read — adapters that genuinely need cloud values must
      // request them through their setup() flow first (where setSecret
      // primes memCache). Outside setup, falling back to env is fine.
      return memCache.get(key) ?? process.env[key];
    },
    async setSecret(key, value) {
      memCache.set(key, value);
      process.env[key] = value;
      if (await authedOnce()) {
        try {
          await setSecretInCloud(key, value);
          console.log(kleur.dim(`  ✓ ${key} encrypted → sh1pt.com vault`));
          return;
        } catch (err) {
          console.log(kleur.yellow(`  ⚠ cloud vault write failed (${err instanceof Error ? err.message : 'unknown'}). Kept in process memory only.`));
          return;
        }
      }
      console.log(kleur.dim(`  ${key} kept in process memory (run \`sh1pt login\` to sync to your sh1pt.com vault)`));
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
