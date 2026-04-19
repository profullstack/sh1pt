import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { projects } from './routes/projects.js';
import { releases } from './routes/releases.js';
import { builds } from './routes/builds.js';
import { targets } from './routes/targets.js';
import { credentials } from './routes/credentials.js';
import { webhooks } from './routes/webhooks.js';
import { auth } from './routes/auth.js';
import { agents } from './routes/agents.js';

export const app = new Hono();

app.use('*', logger());

app.get('/', (c) => c.json({ name: 'sh1pt', version: '0.0.0' }));
app.get('/health', (c) => c.json({ ok: true }));

app.route('/v1/auth', auth);
app.route('/v1/projects', projects);
app.route('/v1/projects/:projectId/releases', releases);
app.route('/v1/projects/:projectId/builds', builds);
app.route('/v1/projects/:projectId/targets', targets);
app.route('/v1/projects/:projectId/credentials', credentials);
app.route('/v1/webhooks', webhooks);
app.route('/v1/agents', agents);

export default app;
