// sh1pt adapter setup pattern.
//
// Every adapter that the CLI exposes a `setup` subcommand for (social,
// bot, webhook, bridge, cloud, dns, payment, merch, promo, vcs, agent,
// captcha, docs, target) MUST implement the same contract: try to
// automate credential capture + API probe, and if anything the adapter
// can't do on its own comes up, return human-readable manual steps
// instead of throwing. Whatever config the adapter produces is
// persisted to `~/.config/sh1pt/config.json` under `adapters.<id>`.
//
// The pattern keeps setup predictable across 175 adapters:
//   1. try the fastest path (webhook URL paste, token paste, OAuth)
//   2. on failure, fall back to instructions with deep links
//   3. save whatever partial config was gathered
//   4. mark ok=false so the CLI can surface "setup incomplete"
//
// Secrets go to the vault via ctx.setSecret — never into config.json.

import { configPath, setAdapterConfig } from './config-store.js';

export interface SetupPromptDef<T = string> {
  type: 'text' | 'password' | 'select' | 'confirm';
  message: string;
  initial?: T;
  choices?: Array<{ title: string; value: T }>;
  validate?: (value: T) => string | true;
}

export interface SetupContext {
  secret(key: string): string | undefined;
  setSecret(key: string, value: string): Promise<void>;
  log(message: string): void;
  prompt<T = string>(def: SetupPromptDef<T>): Promise<T>;
  open(url: string): Promise<void>;
}

export interface SetupResult<Config = unknown> {
  // true = config is sufficient to use the adapter end-to-end.
  // false = we captured what we could; user must complete `manual` steps
  //   before things like `post` / `publish` / `connect` will succeed.
  ok: boolean;
  config: Config;
  manual?: string[];
}

export interface AdapterWithSetup<Config = unknown> {
  id: string;
  label: string;
  setup?(ctx: SetupContext): Promise<SetupResult<Config>>;
}

// Orchestrator. The CLI calls this once per `sh1pt <domain> <adapter> setup`.
// Responsibilities: invoke adapter.setup(), persist the returned config to
// the config store, surface manual steps, never throw on user-facing errors.
export async function runSetup<Config = unknown>(
  adapter: AdapterWithSetup<Config>,
  ctx: SetupContext
): Promise<SetupResult<Config>> {
  ctx.log(`[setup] ${adapter.id} — ${adapter.label}`);

  if (!adapter.setup) {
    const message = `${adapter.id} has no setup() method yet. Track at https://github.com/profullstack/sh1pt/issues`;
    ctx.log(`  skip: ${message}`);
    return { ok: false, config: {} as Config, manual: [message] };
  }

  let result: SetupResult<Config>;
  try {
    result = await adapter.setup(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.log(`  automation failed: ${message}`);
    ctx.log(`  falling back — adapters should return manual steps instead of throwing.`);
    return {
      ok: false,
      config: {} as Config,
      manual: [`Setup threw: ${message}`, `File an issue: https://github.com/profullstack/sh1pt/issues`],
    };
  }

  await setAdapterConfig(adapter.id, result.config);
  ctx.log(`  saved → ${configPath()} · adapters.${adapter.id}`);

  if (!result.ok && result.manual && result.manual.length > 0) {
    ctx.log('');
    ctx.log('  Manual steps remaining:');
    for (const step of result.manual) ctx.log(`    • ${step}`);
  } else if (result.ok) {
    ctx.log(`  ✓ ready — ${adapter.id} is configured.`);
  }

  return result;
}
