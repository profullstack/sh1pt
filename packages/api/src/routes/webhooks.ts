import { Hono } from 'hono';

export const webhooks = new Hono();

// inbound: receive notifications from stores (App Store Connect, Play, etc.)
webhooks.post('/inbound/:source', async (c) => {
  const source = c.req.param('source');
  const body = await c.req.json().catch(() => ({}));
  console.log(`[webhook:inbound] ${source}`, body);
  return c.json({ received: true });
});

// outbound: catalog user-configured subscriptions
webhooks.get('/subscriptions', (c) => c.json({ subscriptions: [] }));
webhooks.post('/subscriptions', async (c) => c.json({ id: 'sub_stub', ...(await c.req.json()) }, 201));
webhooks.delete('/subscriptions/:id', (c) => c.body(null, 204));
