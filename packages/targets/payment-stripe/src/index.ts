import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';

interface Config {
  command?: 'create' | 'get' | 'list' | 'customer' | 'refund';
  args?: Record<string, unknown>;
  description?: string;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function requirePositiveInteger(value: unknown, name: string, defaultValue: number): number {
  const numberValue = value ?? defaultValue;
  if (typeof numberValue !== 'number' || !Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return numberValue;
}

function requireCurrency(value: unknown): string {
  const currency = typeof value === 'string' ? value.trim().toLowerCase() : 'usd';
  if (!/^[a-z]{3}$/.test(currency)) throw new Error('currency must be a three-letter ISO code');
  return currency;
}

function requireEmail(value: unknown): string {
  const email = requireText(value, 'email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email must be a valid email address');
  return email;
}

export default defineTarget<Config>({
  id: 'payment-stripe',
  kind: 'payment',
  label: 'Stripe (CLI wrapper)',

  async build(ctx, _config) {
    if (ctx.dryRun) return { artifact: 'dry-run' };
    ctx.log('stripe: verifying CLI availability');

    // 1. Auto-install CLI if missing
    try {
      await exec('stripe', ['--version'], { log: ctx.log, throwOnNonZero: false });
    } catch {
      ctx.log('CLI not found — installing globally');
      await exec('npm', ['install', '-g', 'stripe'], {
        log: ctx.log, throwOnNonZero: true,
      });
    }

    // 2. Check and set API key
    const key = ctx.secret('STRIPE_API_KEY');
    if (!key) {
      throw new Error('STRIPE_API_KEY not set — run `sh1pt secret set STRIPE_API_KEY <key>` (required)');
    }

    try {
      await exec('stripe', ['config', 'set-key', key], {
        log: ctx.log, throwOnNonZero: true,
      });
      await exec('stripe', ['balance'], { log: ctx.log, throwOnNonZero: false });
    } catch (e) {
      throw new Error(`Stripe config failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { artifact: 'ready' };
  },

  async ship(ctx, config) {
    const cmd = config.command ?? 'create';
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: cmd } };

    switch (cmd) {
      case 'create': {
        const args = ['payment_intents', 'create'];
        const amount = requirePositiveInteger(config.args?.amount, 'amount', 100);
        const currency = requireCurrency(config.args?.currency);
        args.push('--amount', String(amount));
        args.push('--currency', currency);
        if (config.description) args.push('--description', config.description);

        const { stdout } = await exec('stripe', args, { log: ctx.log, throwOnNonZero: true });
        return { id: `pi_${Date.now()}`, meta: { raw: stdout.trim() } };
      }

      case 'get': {
        const pi = requireText(config.args?.paymentIntentId, 'paymentIntentId');
        const { stdout } = await exec('stripe', ['payment_intents', 'retrieve', pi], { log: ctx.log });
        return { id: pi, meta: { raw: stdout.trim() } };
      }

      case 'list': {
        const limit = requirePositiveInteger(config.args?.limit, 'limit', 10);
        const { stdout } = await exec('stripe', ['payment_intents', 'list', `--limit=${limit}`], { log: ctx.log });
        return { id: `list-${Date.now()}`, meta: { raw: stdout.trim() } };
      }

      case 'customer': {
        const email = requireEmail(config.args?.email);
        const { stdout } = await exec('stripe', ['customers', 'create', `--email=${email}`], { log: ctx.log });
        return { id: `cus_${Date.now()}`, meta: { raw: stdout.trim() } };
      }

      case 'refund': {
        const pi = requireText(config.args?.paymentIntentId, 'paymentIntentId');
        const { stdout } = await exec('stripe', ['refunds', 'create', `--payment-intent=${pi}`], { log: ctx.log });
        return { id: `refund_${Date.now()}`, meta: { raw: stdout.trim() } };
      }

      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  },

  setup: setupGuide({
    label: 'Stripe CLI',
    vendorDocUrl: 'https://stripe.com/docs/cli',
    steps: [
      'Install the Stripe CLI: brew install stripe/stripe-cli/stripe',
      'Log in: stripe login (or set the secret key directly)',
      'Run: sh1pt secret set STRIPE_API_KEY <sk_test_...>',
    ],
  }),
});
