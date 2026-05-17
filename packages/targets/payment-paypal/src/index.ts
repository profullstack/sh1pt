import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';

interface Config {
  command?: 'create' | 'get' | 'list' | 'capture' | 'refund';
  args?: Record<string, unknown>;
  description?: string;
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
        const amount = config.args?.amount ?? 100;
        const currency = (config.args?.currency as string) ?? 'USD';
        const args = ['orders', 'create', '--amount', String(amount), '--currency', currency];
        if (config.description) args.push('--description', config.description);
        const { stdout } = await exec('paypal', args, { log: ctx.log, throwOnNonZero: true });
        return { id: `order_${Date.now()}`, meta: { raw: stdout.trim() } };
      }
      case 'get': {
        const orderId = config.args?.orderId as string;
        if (!orderId) throw new Error('orderId required');
        const { stdout } = await exec('paypal', ['orders', 'get', orderId], { log: ctx.log });
        return { id: orderId, meta: { raw: stdout.trim() } };
      }
      case 'list': {
        const limit = config.args?.limit ?? 10;
        const { stdout } = await exec('paypal', ['orders', 'list', `--limit=${limit}`], { log: ctx.log });
        return { id: `list-${Date.now()}`, meta: { raw: stdout.trim() } };
      }
      case 'capture': {
        const orderId = config.args?.orderId as string;
        if (!orderId) throw new Error('orderId required');
        const { stdout } = await exec('paypal', ['orders', 'capture', orderId], { log: ctx.log });
        return { id: `capture_${Date.now()}`, meta: { raw: stdout.trim() } };
      }
      case 'refund': {
        const captureId = config.args?.captureId as string;
        if (!captureId) throw new Error('captureId required');
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