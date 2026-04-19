import { Hono } from 'hono';

export const builds = new Hono();

builds.get('/', (c) => c.json({ projectId: c.req.param('projectId'), builds: [] }));
builds.post('/', async (c) => c.json({ id: 'build_stub', status: 'queued', target: (await c.req.json()).target }, 201));
builds.get('/:buildId', (c) => c.json({ id: c.req.param('buildId'), status: 'running' }));
builds.get('/:buildId/logs', (c) => c.text('# build logs stream (SSE/NDJSON TBD)\n'));
builds.post('/:buildId/cancel', (c) => c.json({ id: c.req.param('buildId'), status: 'cancelled' }));
