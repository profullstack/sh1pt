# next-supabase

Next.js 15 (App Router, React 19) + Supabase (Auth + Postgres + Storage) sh1pt boilerplate.

```bash
cp -r boilerplates/next-supabase my-app
cd my-app
cp .env.example .env.local  # then fill in Supabase keys
npm install
npm run dev

# once ready to ship:
npx sh1pt setup             # wire credentials (one time)
npx sh1pt ship --channel beta
```

Ships to `web-static` by default (Cloudflare Pages). Uncomment `deploy-workers` or `deploy-vercel` in `sh1pt.config.ts` for SSR/edge hosting.
