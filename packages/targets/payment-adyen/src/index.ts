import { defineTarget, setupGuide } from '@profullstack/sh1pt-core';

interface Config {
  command?: 'payment' | 'capture' | 'refund' | 'cancel' | 'status';
  args?: Record<string, unknown>;
}

interface AdyenError {
  errorCode?: string;
  message?: string;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function requireSecret(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} not set`);
  return value;
}

function requirePositiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function requireCurrency(value: unknown): string {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency must be a three-letter ISO code');
  return currency;
}

function optionalAmount(value: unknown, currency: unknown): { value: number; currency: string } | undefined {
  if (value === undefined) return undefined;
  return { value: requirePositiveInteger(value, 'amount'), currency: requireCurrency(currency) };
}

export default defineTarget<Config>({
  id: 'payment-adyen',
  kind: 'payment',
  label: 'Adyen',

  async build(ctx, config) {
    const cmd = config.command || 'status';
    const key = requireSecret(ctx.secret('ADYEN_API_KEY'), 'ADYEN_API_KEY');
    const merchant = requireSecret(ctx.secret('ADYEN_MERCHANT_ACCOUNT'), 'ADYEN_MERCHANT_ACCOUNT');
    const base = 'https://checkout-test.adyen.com/v71';

    async function adyen(path: string, init?: RequestInit) {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          'X-API-Key': key,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data as AdyenError;
        throw new Error(err.message || `Adyen API error: ${res.status}`);
      }
      return data;
    }

    switch (cmd) {
      case 'payment': {
        const amount = requirePositiveInteger(config.args?.amount, 'amount');
        const currency = requireCurrency(config.args?.currency);
        const ref = `sh1pt-${Date.now()}`;
        ctx.log(`adyen: creating payment of ${amount} ${currency}`);
        const data = await adyen('/payments', {
          method: 'POST',
          body: JSON.stringify({
            amount: { value: amount, currency },
            reference: ref,
            merchantAccount: merchant,
            channel: 'web',
            returnUrl: 'https://sh1pt.com/adyen/redirect',
          }),
        });
        return { artifact: 'adyen-payment-create', meta: { raw: JSON.stringify(data) } };
      }
      case 'capture': {
        const psp = requireText(config.args?.pspReference, 'pspReference');
        const amount = optionalAmount(config.args?.amount, config.args?.currency);
        ctx.log(`adyen: capturing ${psp}`);
        const data = await adyen(`/payments/${psp}/captures`, {
          method: 'POST',
          body: JSON.stringify({
            merchantAccount: merchant,
            amount,
          }),
        });
        return { artifact: 'adyen-payment-capture', meta: { raw: JSON.stringify(data) } };
      }
      case 'refund': {
        const psp = requireText(config.args?.pspReference, 'pspReference');
        const amount = optionalAmount(config.args?.amount, config.args?.currency);
        ctx.log(`adyen: refunding ${psp}`);
        const data = await adyen(`/payments/${psp}/refunds`, {
          method: 'POST',
          body: JSON.stringify({ merchantAccount: merchant, amount }),
        });
        return { artifact: 'adyen-payment-refund', meta: { raw: JSON.stringify(data) } };
      }
      case 'cancel': {
        const psp = requireText(config.args?.pspReference, 'pspReference');
        ctx.log(`adyen: canceling ${psp}`);
        const data = await adyen(`/payments/${psp}/cancels`, {
          method: 'POST',
          body: JSON.stringify({ merchantAccount: merchant }),
        });
        return { artifact: 'adyen-payment-cancel', meta: { raw: JSON.stringify(data) } };
      }
      case 'status': {
        const psp = typeof config.args?.pspReference === 'string' ? config.args.pspReference.trim() : '';
        ctx.log(`adyen: checking status of ${psp || 'all'}`);
        const endpoint = psp ? `/payments/${psp}` : '/payments';
        const data = await adyen(endpoint);
        return { artifact: 'adyen-payment-status', meta: { raw: JSON.stringify(data) } };
      }
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  },

  async ship(ctx, _config) {
    ctx.log('adyen: verifying setup');
    if (!ctx.secret('ADYEN_API_KEY') || !ctx.secret('ADYEN_MERCHANT_ACCOUNT')) {
      const setup = setupGuide({
        title: 'Adyen API Key & Merchant Account',
        steps: [
          '1. Go to https://ca-test.adyen.com (test) or https://ca-live.adyen.com (live)',
          '2. Settings → API credentials → Generate API key',
          '3. Run: sh1pt secret set ADYEN_API_KEY <key>',
          '4. Run: sh1pt secret set ADYEN_MERCHANT_ACCOUNT <account>',
        ],
      });
      return { id: 'setup-required', meta: { setup } };
    }
    return { id: 'ready', meta: { status: 'ready' } };
  },
});
