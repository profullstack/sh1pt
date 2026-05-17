import { defineTarget, setupGuide } from '@profullstack/sh1pt-core';

interface Config {
  command?: 'create' | 'get' | 'cancel' | 'list' | 'refund';
  args?: Record<string, unknown>;
  locationId?: string;
}

interface SquareError {
  errors?: Array<{ code: string; detail: string }>;
}

export default defineTarget<Config>({
  id: 'payment-square',
  kind: 'payment',
  label: 'Square',

  async build(ctx, config) {
    const cmd = config.command || 'list';
    const key = ctx.secret('SQUARE_ACCESS_TOKEN');
    if (!key) throw new Error('SQUARE_ACCESS_TOKEN not set');
    const location = config.locationId || ctx.secret('SQUARE_LOCATION_ID') || 'main';
    const base = 'https://connect.squareup.com/v2';

    async function sq(path: string, init?: RequestInit) {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data as SquareError;
        throw new Error(err.errors?.[0]?.detail || `Square API error: ${res.status}`);
      }
      return data;
    }

    switch (cmd) {
      case 'create': {
        const amount = config.args?.amount as number || 0;
        const currency = config.args?.currency as string || 'USD';
        const sourceId = config.args?.sourceId as string || '';
        ctx.log(`square: creating payment of ${amount} ${currency}`);
        const data = await sq('/payments', {
          method: 'POST',
          body: JSON.stringify({
            source_id: sourceId,
            idempotency_key: `sh1pt-${Date.now()}`,
            amount_money: { amount, currency },
            location_id: location,
          }),
        });
        return { output: JSON.stringify(data) };
      }
      case 'get': {
        const id = config.args?.paymentId as string || '';
        ctx.log(`square: getting payment ${id}`);
        const data = await sq(`/payments/${id}`);
        return { output: JSON.stringify(data) };
      }
      case 'cancel': {
        const id = config.args?.paymentId as string || '';
        ctx.log(`square: canceling payment ${id}`);
        const data = await sq(`/payments/${id}/cancel`, { method: 'POST' });
        return { output: JSON.stringify(data) };
      }
      case 'list': {
        ctx.log('square: listing payments');
        const data = await sq('/payments');
        return { output: JSON.stringify(data) };
      }
      case 'refund': {
        const id = config.args?.paymentId as string || '';
        ctx.log(`square: refunding payment ${id}`);
        const data = await sq('/refunds', {
          method: 'POST',
          body: JSON.stringify({
            idempotency_key: `sh1pt-${Date.now()}`,
            payment_id: id,
            amount_money: config.args?.amount,
            reason: (config.args?.reason as string) || 'requested_by_customer',
          }),
        });
        return { output: JSON.stringify(data) };
      }
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  },

  async ship(ctx, _config) {
    ctx.log('square: verifying setup');
    const key = ctx.secret('SQUARE_ACCESS_TOKEN');
    if (!key) {
      return setupGuide({
        title: 'Square Access Token',
        steps: [
          '1. Go to https://developer.squareup.com/apps',
          '2. Create or select your app',
          '3. Go to Credentials → Access Token',
          '4. Copy your Sandbox or Production token',
          '5. Run: sh1pt secret set SQUARE_ACCESS_TOKEN <token>',
        ],
      });
    }
    return { status: 'ready' };
  },
});
