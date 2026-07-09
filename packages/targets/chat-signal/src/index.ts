import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Signal has no official bot platform and no app directory. Bots are
// built by running `signal-cli` (or the `signald` daemon) as a registered
// Signal user with a dedicated phone number. This adapter provisions
// and configures that runtime — it does NOT submit to any store because
// there is none.
//
// Heads up: Signal discourages bot-style usage and account numbers are
// tied to phone numbers. Large-scale agent-driven bot flooding here
// will get numbers flagged. The policy linter's rate-shape rule
// applies doubly.
interface Config {
  phoneNumber: string;                   // e.g. '+14155551234'
  runtime: 'signal-cli' | 'signald';
  captchaToken?: string;                 // required for first registration
  deviceName?: string;
}

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`chat-signal requires ${field}`);
  return trimmed;
}

function optionalValue(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireValue(value, field);
}

function phoneNumber(value: string | undefined): string {
  const phone = requireValue(value, 'phoneNumber');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('chat-signal phoneNumber must be a valid E.164 number');
  return phone;
}

function runtime(value: Config['runtime'] | undefined): Config['runtime'] {
  if (value !== 'signal-cli' && value !== 'signald') {
    throw new Error('chat-signal runtime must be signal-cli or signald');
  }
  return value;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    phoneNumber: phoneNumber(config.phoneNumber),
    runtime: runtime(config.runtime),
    captchaToken: optionalValue(config.captchaToken, 'captchaToken'),
    deviceName: optionalValue(config.deviceName, 'deviceName'),
  };
}

export default defineTarget<Config>({
  id: 'chat-signal',
  kind: 'chat',
  label: 'Signal (signal-cli / signald)',
  async build(ctx, config) {
    config = normalizedConfig(config);
    ctx.log(`prepare ${config.runtime} config for ${config.phoneNumber}`);
    const artifactDir = join(ctx.outDir, 'signal-runtime');
    const planPath = join(artifactDir, 'signal-runtime-plan.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(planPath, `${JSON.stringify({
      phoneNumber: config.phoneNumber,
      runtime: config.runtime,
      deviceName: config.deviceName,
      captchaTokenPresent: !!config.captchaToken,
    }, null, 2)}\n`, 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
    ctx.log(`register Signal number ${config.phoneNumber} (${config.runtime})`);
    if (ctx.dryRun) return { id: 'dry-run' };
    if (!config.captchaToken) throw new Error('chat-signal requires captchaToken for Signal registration');
    // TODO:
    //  - signal-cli register -v <phone> (requires captchaToken)
    //  - verify with SMS/voice code (human step unless using a SIP gateway)
    //  - store runtime secrets (identity keys) in secrets vault
    return { id: `signal:${config.phoneNumber}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: "Signal (signal-cli)",
    vendorDocUrl: "https://github.com/AsamK/signal-cli",
    steps: [
      "Signal has no app directory \u2014 distribute via signal-cli or libsignal-service",
      "Install signal-cli locally and register a dedicated sh1pt phone number",
      "No automation possible for account creation",
    ],
  }),
});
