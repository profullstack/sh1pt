import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const app = new Hono();

app.get('/', (c) => c.text('sh1pt · bun + hono + supabase'));

app.get('/me', async (c) => {
  const token = c.req.header('authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'missing bearer token' }, 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return c.json({ error: error.message }, 401);
  return c.json({ user: data.user });
});

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
