import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

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

export default defineTarget<Config>({
  id: 'chat-signal',
  kind: 'chat',
  label: 'Signal (signal-cli / signald)',
  async build(ctx, config) {
    ctx.log(`prepare ${config.runtime} config for ${config.phoneNumber}`);
    // TODO: render signal-cli / signald config + dockerfile to ctx.outDir
    return { artifact: `${ctx.outDir}/signal-runtime/` };
  },
  async ship(ctx, config) {
    ctx.log(`register Signal number ${config.phoneNumber} (${config.runtime})`);
    if (ctx.dryRun) return { id: 'dry-run' };
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
