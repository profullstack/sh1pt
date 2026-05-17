import { defineTarget, setupGuide } from '@profullstack/sh1pt-core';

interface Config {
  command?: 'payment' | 'capture' | 'refund' | 'cancel' | 'status';
  args?: Record<string, unknown>;
}

interface AdyenError {
  errorCode?: string;
  message?: string;
}

export default defineTarget<Config>({
  id: 'payment-adyen',
  kind: 'payment',
  label: 'Adyen',

  async build(ctx, config) {
    const cmd = config.command || 'status';
    const key = ctx.secret('ADYEN_API_KEY');
    const merchant = ctx.secret('ADYEN_MERCHANT_ACCOUNT');
    if (!key) throw new Error('ADYEN_API_KEY not set');
    if (!merchant) throw new Error('ADYEN_MERCHANT_ACCOUNT not set');
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
        const amount = config.args?.amount as number || 0;
        const currency = config.args?.currency as string || 'USD';
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
        return { output: JSON.stringify(data) };
      }
      case 'capture': {
        const psp = config.args?.pspReference as string || '';
        ctx.log(`adyen: capturing ${psp}`);
        const data = await adyen(`/payments/${psp}/captures`, {
          method: 'POST',
          body: JSON.stringify({
            merchantAccount: merchant,
            amount: config.args?.amount ? { value: config.args.amount as number, currency: (config.args?.currency as string) || 'USD' } : undefined,
          }),
        });
        return { output: JSON.stringify(data) };
      }
      case 'refund': {
        const psp = config.args?.pspReference as string || '';
        ctx.log(`adyen: refunding ${psp}`);
        const data = await adyen(`/payments/${psp}/refunds`, {
          method: 'POST',
          body: JSON.stringify({ merchantAccount: merchant, amount: config.args?.amount }),
        });
        return { output: JSON.stringify(data) };
      }
      case 'cancel': {
        const psp = config.args?.pspReference as string || '';
        ctx.log(`adyen: canceling ${psp}`);
        const data = await adyen(`/payments/${psp}/cancels`, {
          method: 'POST',
          body: JSON.stringify({ merchantAccount: merchant }),
        });
        return { output: JSON.stringify(data) };
      }
      case 'status': {
        const psp = config.args?.pspReference as string || '';
        ctx.log(`adyen: checking status of ${psp || 'all'}`);
        const endpoint = psp ? `/payments/${psp}` : '/payments';
        const data = await adyen(endpoint);
        return { output: JSON.stringify(data) };
      }
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  },

  async ship(ctx, _config) {
    ctx.log('adyen: verifying setup');
    if (!ctx.secret('ADYEN_API_KEY') || !ctx.secret('ADYEN_MERCHANT_ACCOUNT')) {
      return setupGuide({
        title: 'Adyen API Key & Merchant Account',
        steps: [
          '1. Go to https://ca-test.adyen.com (test) or https://ca-live.adyen.com (live)',
          '2. Settings → API credentials → Generate API key',
          '3. Run: sh1pt secret set ADYEN_API_KEY <key>',
          '4. Run: sh1pt secret set ADYEN_MERCHANT_ACCOUNT <account>',
        ],
      });
    }
    return { status: 'ready' };
  },
});
