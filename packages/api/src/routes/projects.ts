import { Hono } from 'hono';

export const projects = new Hono();

projects.get('/', (c) => c.json({ projects: [] }));
projects.post('/', async (c) => c.json({ id: 'stub', ...(await c.req.json()) }, 201));
projects.get('/:projectId', (c) => c.json({ id: c.req.param('projectId'), name: 'stub' }));
projects.patch('/:projectId', (c) => c.json({ id: c.req.param('projectId'), updated: true }));
projects.delete('/:projectId', (c) => c.body(null, 204));
