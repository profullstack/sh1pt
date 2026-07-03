import { Hono } from 'hono';
import { z } from 'zod';

export const webhooks = new Hono();

const subscriptionSchema = z.object({
  source: z.string().trim().min(1),
  event: z.string().trim().min(1),
  url: z.string().url(),
  secretRef: z.string().trim().min(1).optional(),
});

const parseJson = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

webhooks.post('/inbound/:source', async (c) => {
  const source = c.req.param('source');
  const body = await parseJson(c.req.raw);

  if (body === undefined) {
    return c.json({ error: 'invalid_webhook_payload' }, 400);
  }

  console.log(`[webhook:inbound] ${source}`, body);
  return c.json({ received: true, source });
});

webhooks.get('/subscriptions', (c) => c.json({ subscriptions: [] }));
webhooks.post('/subscriptions', async (c) => {
  const parsed = subscriptionSchema.safeParse(await parseJson(c.req.raw));

  if (!parsed.success) {
    return c.json({ error: 'invalid_subscription', issues: parsed.error.issues }, 400);
  }

  return c.json(
    {
      id: `sub_${parsed.data.source}_${parsed.data.event}`.replace(/[^a-zA-Z0-9_]+/g, '_'),
      ...parsed.data,
    },
    201,
  );
});
webhooks.delete('/subscriptions/:id', (c) => c.body(null, 204));
