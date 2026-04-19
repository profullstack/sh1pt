import { Hono } from 'hono';

// Agent-oriented bulk endpoints. Designed for LLM agents that publish many
// apps/week: one POST creates a project, wires targets, seeds secrets, and
// kicks a ship — no multi-step orchestration needed from the agent side.
export const agents = new Hono();

agents.post('/publish', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  // { name, version, targets: [{use, config}], secrets: {...}, channel }
  return c.json({
    projectId: 'proj_stub',
    releaseId: 'rel_stub',
    status: 'queued',
    watch: '/v1/projects/proj_stub/releases/rel_stub',
    echo: body,
  }, 201);
});

agents.post('/bulk-publish', async (c) => {
  const { projects = [] } = await c.req.json().catch(() => ({ projects: [] }));
  return c.json({
    accepted: projects.length,
    releases: projects.map((_: unknown, i: number) => ({ id: `rel_bulk_${i}`, status: 'queued' })),
  }, 202);
});

agents.get('/quota', (c) => c.json({
  plan: 'cloud-499',
  period: 'annual',
  shipsPerMonth: { used: 0, limit: 1000 },
  buildMinutes: { used: 0, limit: 5000 },
  projects: { used: 0, limit: 'unlimited' },
}));
