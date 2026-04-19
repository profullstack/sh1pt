import { Hono } from 'hono';

export const releases = new Hono();

releases.get('/', (c) => c.json({ projectId: c.req.param('projectId'), releases: [] }));
releases.post('/', async (c) => c.json({ id: 'rel_stub', version: '0.0.0', channel: 'stable', status: 'pending' }, 201));
releases.get('/:releaseId', (c) => c.json({ id: c.req.param('releaseId'), status: 'live', targets: [] }));
releases.post('/:releaseId/rollback', (c) => c.json({ id: c.req.param('releaseId'), status: 'rolled-back' }));
releases.post('/:releaseId/promote', async (c) => c.json({ id: c.req.param('releaseId'), channel: (await c.req.json()).channel }));
