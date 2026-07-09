import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';

interface Config {
  command?: 'create' | 'get' | 'list' | 'capture' | 'refund';
  args?: Record<string, unknown>;
  description?: string;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function requirePositiveAmount(value: unknown): number {
  const amount = value ?? 100;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }
  return amount;
}

function requireCurrency(value: unknown): string {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency must be a three-letter ISO code');
  return currency;
}

function requirePositiveInteger(value: unknown, name: string): number {
  const numberValue = value ?? 10;
  if (typeof numberValue !== 'number' || !Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return numberValue;
}

export default defineTarget<Config>({
  id: 'payment-paypal',
  kind: 'payment',
  label: 'PayPal (CLI wrapper)',

  async build(ctx, _config) {
    if (ctx.dryRun) return { artifact: 'dry-run' };
    ctx.log('paypal: verifying CLI availability');
    try {
      await exec('paypal', ['--version'], { log: ctx.log, throwOnNonZero: false });
    } catch {
      ctx.log('CLI not found — installing globally');
      await exec('npm', ['install', '-g', '@paypal/cli'], { log: ctx.log, throwOnNonZero: true });
    }
    const clientId = ctx.secret('PAYPAL_CLIENT_ID');
    const clientSecret = ctx.secret('PAYPAL_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET required');
    try {
      await exec('paypal', ['config', 'set', 'client-id', clientId], { log: ctx.log, throwOnNonZero: true });
      await exec('paypal', ['config', 'set', 'client-secret', clientSecret], { log: ctx.log, throwOnNonZero: true });
      await exec('paypal', ['auth', 'test'], { log: ctx.log, throwOnNonZero: false });
    } catch (e) {
      throw new Error(`PayPal config failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { artifact: 'ready' };
  },

  async ship(ctx, config) {
    const cmd = config.command ?? 'create';
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: cmd } };
    switch (cmd) {
      case 'create': {
        const amount = requirePositiveAmount(config.args?.amount);
        const currency = requireCurrency(config.args?.currency);
        const args = ['orders', 'create', '--amount', String(amount), '--currency', currency];
        if (config.description) args.push('--description', config.description);
        const { stdout } = await exec('paypal', args, { log: ctx.log, throwOnNonZero: true });
        return { id: `order_${Date.now()}`, meta: { raw: stdout.trim() } };
      }
      case 'get': {
        const orderId = requireText(config.args?.orderId, 'orderId');
        const { stdout } = await exec('paypal', ['orders', 'get', orderId], { log: ctx.log });
        return { id: orderId, meta: { raw: stdout.trim() } };
      }
      case 'list': {
        const limit = requirePositiveInteger(config.args?.limit, 'limit');
        const { stdout } = await exec('paypal', ['orders', 'list', `--limit=${limit}`], { log: ctx.log });
        return { id: `list-${Date.now()}`, meta: { raw: stdout.trim() } };
      }
      case 'capture': {
        const orderId = requireText(config.args?.orderId, 'orderId');
        const { stdout } = await exec('paypal', ['orders', 'capture', orderId], { log: ctx.log });
        return { id: `capture_${Date.now()}`, meta: { raw: stdout.trim() } };
      }
      case 'refund': {
        const captureId = requireText(config.args?.captureId, 'captureId');
        const { stdout } = await exec('paypal', ['refunds', 'create', captureId], { log: ctx.log });
        return { id: `refund_${Date.now()}`, meta: { raw: stdout.trim() } };
      }
      default: throw new Error(`Unknown command: ${cmd}`);
    }
  },

  setup: setupGuide({
    label: 'PayPal CLI',
    vendorDocUrl: 'https://developer.paypal.com/api/rest/',
    steps: [
      'Install: npm install -g @paypal/cli',
      'Get Client ID + Secret from PayPal Developer Dashboard',
      'Run: sh1pt secret set PAYPAL_CLIENT_ID <id>',
      'Run: sh1pt secret set PAYPAL_CLIENT_SECRET <secret>',
    ],
  }),
});
