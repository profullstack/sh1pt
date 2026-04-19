import { Hono } from 'hono';

export const auth = new Hono();

auth.post('/device/code', (c) => c.json({ device_code: 'stub', user_code: 'STUB', verification_uri: 'https://sh1pt.dev/device', interval: 5 }));
auth.post('/device/token', (c) => c.json({ access_token: 'stub', token_type: 'Bearer' }));
auth.get('/me', (c) => c.json({ id: 'stub-user', email: 'you@example.com' }));
