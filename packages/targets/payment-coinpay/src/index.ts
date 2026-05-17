import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';

interface Config {
  command?: 'create' | 'get' | 'list' | 'rates';
  args?: Record<string, unknown>;
  businessId?: string;
  description?: string;
}

export default defineTarget<Config>({
  id: 'payment-coinpay',
  kind: 'payment',
  label: 'CoinPay (CLI wrapper)',

  async build(ctx, _config) {
    if (ctx.dryRun) return { artifact: 'dry-run' };
    ctx.log('coinpay: verifying CLI availability');

    // 1. Auto-install CLI if missing
    try {
      await exec('coinpay', ['--version'], { log: ctx.log, throwOnNonZero: false });
    } catch {
      ctx.log('CLI not found — installing globally');
      await exec('npm', ['install', '-g', '@profullstack/coinpay'], {
        log: ctx.log, throwOnNonZero: true,
      });
    }

    // 2. Delegate API key setup to the wrapped CLI
    try {
      const { stdout } = await exec('coinpay', ['config', 'get-key'], {
        log: ctx.log, throwOnNonZero: false,
      });
      if (!stdout.trim()) {
        const key = ctx.secret('COINPAY_API_KEY');
        if (key) {
          await exec('coinpay', ['config', 'set-key', key], {
            log: ctx.log, throwOnNonZero: true,
          });
        } else {
          throw new Error('COINPAY_API_KEY not set. Run: sh1pt secret set COINPAY_API_KEY <key>');
        }
      }
    } catch (e) {
      throw new Error(`Config check failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { artifact: 'ready' };
  },

  async ship(ctx, config) {
    const cmd = config.command ?? 'create';
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: cmd } };

    switch (cmd) {
      case 'create': {
        const args = ['payment', 'create'];
        const bizId = config.businessId ?? (config.args?.businessId as string);
        if (bizId) args.push('--business-id', bizId);
        if (config.args?.amount) args.push('--amount', String(config.args.amount));
        if (config.args?.blockchain) args.push('--blockchain', String(config.args.blockchain));
        if (config.description) args.push('--description', config.description);

        const { stdout } = await exec('coinpay', args, { log: ctx.log, throwOnNonZero: true });
        return { id: `cp_${Date.now()}`, meta: { raw: stdout.trim() } };
      }

      case 'get': {
        const paymentId = config.args?.paymentId as string;
        if (!paymentId) throw new Error('paymentId required for get command');
        const { stdout } = await exec('coinpay', ['payment', 'get', paymentId], { log: ctx.log });
        return { id: paymentId, meta: { raw: stdout.trim() } };
      }

      case 'list': {
        const args = ['payment', 'list'];
        const bizId = config.businessId ?? (config.args?.businessId as string);
        if (bizId) args.push('--business-id', bizId);
        const { stdout } = await exec('coinpay', args, { log: ctx.log });
        return { id: `list-${Date.now()}`, meta: { raw: stdout.trim() } };
      }

      case 'rates': {
        const coin = (config.args?.coin as string) ?? 'BTC';
        const fiat = (config.args?.fiat as string) ?? 'USD';
        const { stdout } = await exec('coinpay', ['rates', 'get', coin, '--fiat', fiat], { log: ctx.log });
        return { id: `${coin}-${fiat}`, meta: { raw: stdout.trim() } };
      }

      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  },

  setup: setupGuide({
    label: 'CoinPay CLI',
    vendorDocUrl: 'https://coinpayportal.com/docs/sdk#cli',
    steps: [
      'Install the CLI: npm install -g @profullstack/coinpay',
      'Get API key from dashboard → API Keys',
      'Run: coinpay config set-key <key>',
      'Or: sh1pt secret set COINPAY_API_KEY <key>',
    ],
  }),
});
