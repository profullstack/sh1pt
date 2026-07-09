import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';

interface Config {
  command?: 'create' | 'get' | 'list' | 'rates';
  args?: Record<string, unknown>;
  businessId?: string;
  description?: string;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function optionalText(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  return requireText(value, name);
}

function requirePositiveAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('amount must be a positive number');
  }
  return value;
}

function requireAssetCode(value: unknown, name: string, fallback?: string): string {
  const raw = value === undefined ? fallback : value;
  const code = requireText(raw, name).toUpperCase();
  if (!/^[A-Z0-9_]{2,16}$/.test(code)) throw new Error(`${name} must be an uppercase asset code`);
  return code;
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
        const bizId = optionalText(config.businessId ?? config.args?.businessId, 'businessId');
        if (bizId) args.push('--business-id', bizId);
        const amount = requirePositiveAmount(config.args?.amount);
        args.push('--amount', String(amount));
        if (config.args?.blockchain) args.push('--blockchain', requireAssetCode(config.args.blockchain, 'blockchain'));
        if (config.description) args.push('--description', config.description);

        const { stdout } = await exec('coinpay', args, { log: ctx.log, throwOnNonZero: true });
        return { id: `cp_${Date.now()}`, meta: { raw: stdout.trim() } };
      }

      case 'get': {
        const paymentId = requireText(config.args?.paymentId, 'paymentId');
        const { stdout } = await exec('coinpay', ['payment', 'get', paymentId], { log: ctx.log });
        return { id: paymentId, meta: { raw: stdout.trim() } };
      }

      case 'list': {
        const args = ['payment', 'list'];
        const bizId = optionalText(config.businessId ?? config.args?.businessId, 'businessId');
        if (bizId) args.push('--business-id', bizId);
        const { stdout } = await exec('coinpay', args, { log: ctx.log });
        return { id: `list-${Date.now()}`, meta: { raw: stdout.trim() } };
      }

      case 'rates': {
        const coin = requireAssetCode(config.args?.coin, 'coin', 'BTC');
        const fiat = requireAssetCode(config.args?.fiat, 'fiat', 'USD');
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
