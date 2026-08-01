import { serve } from '@hono/node-server';
import app from './index.js';
import { resolveApiPort } from './port.js';

const port = resolveApiPort(process.env.PORT);
serve({ fetch: app.fetch, port });
console.log(`sh1pt api listening on :${port}`);
