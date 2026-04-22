// Reusable setup() builders. Every adapter's setup() should be one of
// these — bespoke flows are the exception, not the rule. Keeps the 175
// adapter surfaces consistent without forcing every package to hand-roll
// the prompt/validate/persist dance.
//
// Priority order (matches feedback_secrets_and_scraping.md):
//   1. webhookUrlSetup — paste a vendor-provided URL (fastest, no OAuth)
//   2. tokenSetup      — paste a static API key / bearer token
//   3. oauthSetup      — OAuth-style (falls back to manual token paste
//                        until the cloud redirect flow lands)
//   4. manualSetup     — no automation path; print steps, save nothing
//   5. stubSetup       — default for adapters that haven't declared
//                        anything yet (used by defineXxx() auto-default)

import type { SetupContext, SetupResult } from './setup.js';

type SetupFn<C = unknown> = (ctx: SetupContext) => Promise<SetupResult<C>>;

// Helper used by defineXxx() wrappers to auto-install a stub setup on
// every adapter without needing to edit 175 packages. Adapters that
// provide their own setup keep it; the rest get stubSetup(label).
export function autoSetup<T extends { label: string; setup?: SetupFn<any> }>(adapter: T): T {
  return { ...adapter, setup: adapter.setup ?? stubSetup(adapter.label) };
}

// Default fallback for adapters that haven't declared a real setup yet.
// Emitted automatically by every defineXxx() so `sh1pt <cat> <name> setup`
// is always available.
export function stubSetup<C = unknown>(label?: string): SetupFn<C> {
  return async (ctx) => {
    const name = label ?? 'this adapter';
    ctx.log(`${name}: setup() not wired yet — only the generic fallback runs.`);
    return {
      ok: false,
      config: {} as C,
      manual: [
        `${name} has no adapter-specific setup flow yet.`,
        'File an issue to prioritize: https://github.com/profullstack/sh1pt/issues',
      ],
    };
  };
}

// For webhook-style adapters (Discord, Slack, Teams, generic HTTP, Telegram bot).
// User pastes a URL; we validate the prefix (optional), write to the vault,
// persist a small config marker.
export interface WebhookUrlSetupOpts<C = unknown> {
  secretKey: string;               // vault key, e.g. 'DISCORD_WEBHOOK_URL'
  label: string;                   // human name, e.g. 'Discord (channel webhook)'
  urlPrefix?: string;              // validation prefix, e.g. 'https://discord.com/api/webhooks/'
  vendorDocUrl?: string;           // opened in browser for context
  steps: string[];                 // manual fallback + pre-paste guidance
  config?: C;                      // marker written to config.json
}

export function webhookUrlSetup<C = unknown>(opts: WebhookUrlSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    const existing = ctx.secret(opts.secretKey);
    const validPrefix = (v: string) => !opts.urlPrefix || v.startsWith(opts.urlPrefix);

    if (existing && validPrefix(existing)) {
      const reuse = await ctx.prompt<boolean>({
        type: 'confirm',
        message: `${opts.secretKey} already in vault — reuse it?`,
        initial: true,
      });
      if (reuse) return { ok: true, config: (opts.config ?? {}) as C };
    }

    ctx.log(`${opts.label} — paste a webhook URL. Steps:`);
    for (const line of opts.steps) ctx.log(`  ${line}`);
    if (opts.vendorDocUrl) await ctx.open(opts.vendorDocUrl);

    const url = await ctx.prompt<string>({
      type: 'password',
      message: `Paste the ${opts.label} URL:`,
      validate: opts.urlPrefix
        ? (v) => (!v || v.startsWith(opts.urlPrefix!)) || `Must start with ${opts.urlPrefix}`
        : undefined,
    });

    if (!url || !validPrefix(url)) {
      return { ok: false, config: (opts.config ?? {}) as C, manual: opts.steps };
    }

    await ctx.setSecret(opts.secretKey, url);
    return { ok: true, config: (opts.config ?? {}) as C };
  };
}

// For static-token auth (most APIs: Stripe, Resend, Linear, Porkbun, etc.).
export interface TokenSetupOpts<C = unknown> {
  secretKey: string;               // vault key, e.g. 'STRIPE_SECRET_KEY'
  label: string;                   // human name, e.g. 'Stripe'
  vendorDocUrl?: string;
  steps: string[];
  config?: C;
  // Extra prompts after the primary token (account id, workspace id, etc.).
  // Non-secret values get returned in the config; secret values go to the vault.
  fields?: Array<{
    key: string;                   // config key or secret key
    message: string;
    secret?: boolean;
    required?: boolean;
  }>;
}

export function tokenSetup<C = unknown>(opts: TokenSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    const existing = ctx.secret(opts.secretKey);
    if (existing) {
      const reuse = await ctx.prompt<boolean>({
        type: 'confirm',
        message: `${opts.secretKey} already in vault — reuse it?`,
        initial: true,
      });
      if (reuse) return { ok: true, config: (opts.config ?? {}) as C };
    }

    ctx.log(`${opts.label} setup:`);
    for (const line of opts.steps) ctx.log(`  ${line}`);
    if (opts.vendorDocUrl) await ctx.open(opts.vendorDocUrl);

    const token = await ctx.prompt<string>({
      type: 'password',
      message: `Paste the ${opts.label} API token:`,
    });

    if (!token) {
      return { ok: false, config: (opts.config ?? {}) as C, manual: opts.steps };
    }
    await ctx.setSecret(opts.secretKey, token);

    const configExtras: Record<string, string> = {};
    for (const field of opts.fields ?? []) {
      const val = await ctx.prompt<string>({
        type: field.secret ? 'password' : 'text',
        message: field.message,
      });
      if (!val && field.required) {
        return {
          ok: false,
          config: { ...(opts.config ?? {}), ...configExtras } as unknown as C,
          manual: [`Required field "${field.key}" not supplied — re-run setup.`, ...opts.steps],
        };
      }
      if (val) {
        if (field.secret) await ctx.setSecret(field.key, val);
        else configExtras[field.key] = val;
      }
    }

    return { ok: true, config: { ...(opts.config ?? {}), ...configExtras } as unknown as C };
  };
}

// OAuth adapters — until the cloud redirect flow lands, we fall back to
// the manual-token-paste path with explicit steps for the vendor's
// developer console.
export interface OAuthSetupOpts<C = unknown> {
  secretKey: string;
  label: string;
  vendorDocUrl?: string;
  steps: string[];
  config?: C;
}

export function oauthSetup<C = unknown>(opts: OAuthSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    ctx.log(`${opts.label} uses OAuth. Automated OAuth flow isn't wired yet — capturing a token manually.`);
    for (const line of opts.steps) ctx.log(`  ${line}`);
    if (opts.vendorDocUrl) await ctx.open(opts.vendorDocUrl);

    const token = await ctx.prompt<string>({
      type: 'password',
      message: `Paste the ${opts.label} access token (or leave blank to finish later):`,
    });
    if (!token) {
      return { ok: false, config: (opts.config ?? {}) as C, manual: opts.steps };
    }
    await ctx.setSecret(opts.secretKey, token);
    return { ok: true, config: (opts.config ?? {}) as C };
  };
}

// Pure instructions — no automation possible (App Store identity
// verification, Google Play payment profile, Apple D-U-N-S, etc.).
export interface ManualSetupOpts<C = unknown> {
  label: string;
  vendorDocUrl?: string;
  steps: string[];
  config?: C;
}

export function manualSetup<C = unknown>(opts: ManualSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    ctx.log(`${opts.label}: manual setup only — no automation path yet.`);
    for (const line of opts.steps) ctx.log(`  ${line}`);
    if (opts.vendorDocUrl) await ctx.open(opts.vendorDocUrl);
    return {
      ok: false,
      config: (opts.config ?? {}) as C,
      manual: opts.steps,
    };
  };
}
