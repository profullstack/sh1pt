import { Hono } from 'hono';

export const promo = new Hono();

promo.get('/platforms/available', (c) => c.json({ platforms: [] }));
promo.post('/platforms/:id/connect', async (c) => c.json({ id: c.req.param('id'), accountId: 'stub', connected: true }));

promo.post('/campaigns', async (c) => c.json({ id: 'camp_stub', status: 'queued', ...(await c.req.json()) }, 201));
promo.get('/campaigns', (c) => c.json({ campaigns: [] }));
promo.get('/campaigns/:id', (c) => c.json({ id: c.req.param('id'), state: 'active' }));
promo.post('/campaigns/:id/stop', (c) => c.json({ id: c.req.param('id'), state: 'paused' }));
promo.get('/campaigns/:id/metrics', (c) => c.json({
  id: c.req.param('id'),
  spend: 0, impressions: 0, clicks: 0, installs: 0, conversions: 0,
}));

// Agent-oriented one-shot: "launch a campaign everywhere."
promo.post('/agents/launch', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ campaignGroupId: 'cg_stub', launched: [], echo: body }, 201);
});
