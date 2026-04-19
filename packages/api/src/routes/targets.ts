import { Hono } from 'hono';

export const targets = new Hono();

targets.get('/', (c) => c.json({ projectId: c.req.param('projectId'), targets: [] }));
targets.post('/', async (c) => c.json({ id: (await c.req.json()).use, enabled: true }, 201));
targets.get('/available', (c) => c.json({ adapters: [] }));
targets.patch('/:targetId', (c) => c.json({ id: c.req.param('targetId'), updated: true }));
targets.delete('/:targetId', (c) => c.body(null, 204));
targets.get('/:targetId/status', (c) => c.json({ id: c.req.param('targetId'), state: 'live' }));
