// Shared SetupContext for every CLI-driven adapter setup. Today secrets
// live in process memory + are logged on write; once `sh1pt login` ships
// a real cloud vault, only this file needs to change.
//
// Used by:
//   commands/adapter-cmd.ts  → `sh1pt <category> <name> setup`
//   commands/config.ts       → `sh1pt config webhooks add <target>`
//   commands/promote.ts      → `sh1pt promote social setup`, etc.

import kleur from 'kleur';
import prompts from 'prompts';
import type { SetupContext, SetupPromptDef } from '@profullstack/sh1pt-core';

export function makeCliSetupContext(): SetupContext {
  const memSecrets = new Map<string, string>();
  return {
    secret: (key) => process.env[key] ?? memSecrets.get(key),
    async setSecret(key, value) {
      memSecrets.set(key, value);
      process.env[key] = value;
      console.log(kleur.dim(`  [vault-stub] would persist ${key}=*** (cloud vault not wired yet)`));
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
