# next-plugin-store

Marketplace boilerplate: publishers list plugins, users install them, sh1pt handles Stripe Connect payouts and platform fees.

```bash
cp -r boilerplates/next-plugin-store my-store
cd my-store
npm install

# in your Supabase project:
#   Database → SQL editor → paste supabase/schema.sql → run

cp .env.example .env.local   # then fill in keys
npm run dev

# deploy:
npx sh1pt setup
npx sh1pt ship --channel beta
```

## What's in the box

- **Browse page** (`/`) — approved plugins sorted by downloads
- **Plugin detail** (`/p/[slug]`) — readme, versions, reviews, install button
- **Publisher portal** (`/publisher`) — draft + submit plugins, upload new versions, see revenue
- **Admin approval** (`/admin`) — review queue (gate behind Supabase role check)
- **Stripe Connect** — each publisher onboards as a connected account; platform fee lives in `stripe.create` params
- **License keys** — issued on purchase via `installs.license_key`; your plugin runtime pings `/api/verify` at startup

## Env vars

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service-role — server-only>
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
PLATFORM_FEE_BPS=1500                # 15% = 1500 basis points (5% = 500)
```

## Schema

`supabase/schema.sql` creates the five core tables (`publishers`, `plugins`, `plugin_versions`, `installs`, `reviews`) with RLS policies so publishers can only modify their own plugins and buyers can only see their own purchases.
