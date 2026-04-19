import { Hono } from 'hono';

export const credentials = new Hono();

// values are never returned — only key metadata
credentials.get('/', (c) => c.json({ projectId: c.req.param('projectId'), keys: [] }));
credentials.put('/:key', async (c) => c.json({ key: c.req.param('key'), stored: true }));
credentials.delete('/:key', (c) => c.body(null, 204));
