import { Hono } from 'hono';
import { z } from 'zod';

export const releases = new Hono();

const releaseChannelSchema = z.enum(['stable', 'beta', 'alpha', 'canary']);
const createReleaseSchema = z.object({
  version: z.string().trim().min(1),
  channel: releaseChannelSchema.optional().default('stable'),
  targets: z.array(z.string().trim().min(1)).optional().default([]),
});
const promoteReleaseSchema = z.object({
  channel: releaseChannelSchema,
});

const parseJson = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

releases.get('/', (c) => c.json({ projectId: c.req.param('projectId'), releases: [] }));
releases.post('/', async (c) => {
  const parsed = createReleaseSchema.safeParse(await parseJson(c.req.raw));

  if (!parsed.success) {
    return c.json({ error: 'invalid_release', issues: parsed.error.issues }, 400);
  }

  return c.json(
    {
      id: `rel_${parsed.data.version.replace(/[^a-zA-Z0-9]+/g, '_')}`,
      projectId: c.req.param('projectId'),
      version: parsed.data.version,
      channel: parsed.data.channel,
      targets: parsed.data.targets,
      status: 'pending',
    },
    201,
  );
});
releases.get('/:releaseId', (c) =>
  c.json({
    id: c.req.param('releaseId'),
    projectId: c.req.param('projectId'),
    status: 'live',
    targets: [],
  }),
);
releases.post('/:releaseId/rollback', (c) =>
  c.json({
    id: c.req.param('releaseId'),
    projectId: c.req.param('projectId'),
    status: 'rolled-back',
  }),
);
releases.post('/:releaseId/promote', async (c) => {
  const parsed = promoteReleaseSchema.safeParse(await parseJson(c.req.raw));

  if (!parsed.success) {
    return c.json({ error: 'invalid_promotion', issues: parsed.error.issues }, 400);
  }

  return c.json({
    id: c.req.param('releaseId'),
    projectId: c.req.param('projectId'),
    channel: parsed.data.channel,
    status: 'promoted',
  });
});
