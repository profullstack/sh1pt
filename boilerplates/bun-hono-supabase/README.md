# bun-hono-supabase

Bun + Hono + Supabase sh1pt boilerplate for backend APIs. Bun's `--compile` flag turns the whole app into a single-file executable — minimal cold start, tiny container, no Node runtime to install.

```bash
cp -r boilerplates/bun-hono-supabase my-api
cd my-api
bun install
bun dev

# ship:
npx sh1pt setup
npx sh1pt ship --channel beta     # default → Fly.io
```

Env vars:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key — server-only, never ship to client>
PORT=3000
```

Targets out of the box: `deploy-fly`. Flip `enabled: true` on the `railway` or `docker` targets in `sh1pt.config.ts` to fan out further.
