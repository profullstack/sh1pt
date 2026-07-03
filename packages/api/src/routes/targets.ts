import { Hono } from 'hono';
import { z } from 'zod';

export const targets = new Hono();

const targetConfigSchema = z.record(z.unknown()).default({});
const createTargetSchema = z.object({
  use: z.string().trim().min(1),
  enabled: z.boolean().optional().default(true),
  config: targetConfigSchema,
});
const updateTargetSchema = z
  .object({
    enabled: z.boolean().optional(),
    config: targetConfigSchema.optional(),
  })
  .refine((body) => body.enabled !== undefined || body.config !== undefined, {
    message: 'At least one of enabled or config is required',
  });

const parseJson = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

targets.get('/', (c) => c.json({ projectId: c.req.param('projectId'), targets: [] }));
targets.post('/', async (c) => {
  const parsed = createTargetSchema.safeParse(await parseJson(c.req.raw));

  if (!parsed.success) {
    return c.json({ error: 'invalid_target', issues: parsed.error.issues }, 400);
  }

  return c.json(
    {
      id: parsed.data.use,
      projectId: c.req.param('projectId'),
      enabled: parsed.data.enabled,
      config: parsed.data.config,
    },
    201,
  );
});
targets.get('/available', (c) =>
  c.json({
    adapters: [
      'apple-app-store',
      'google-play',
      'npm',
      'github-releases',
      'webhook',
    ],
  }),
);
targets.patch('/:targetId', async (c) => {
  const parsed = updateTargetSchema.safeParse(await parseJson(c.req.raw));

  if (!parsed.success) {
    return c.json({ error: 'invalid_target_update', issues: parsed.error.issues }, 400);
  }

  return c.json({
    id: c.req.param('targetId'),
    projectId: c.req.param('projectId'),
    updated: true,
    ...parsed.data,
  });
});
targets.delete('/:targetId', (c) => c.body(null, 204));
targets.get('/:targetId/status', (c) =>
  c.json({
    id: c.req.param('targetId'),
    projectId: c.req.param('projectId'),
    state: 'live',
  }),
);
