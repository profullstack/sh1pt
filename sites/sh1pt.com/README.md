# sh1pt.com

The marketing + waitlist + investor page for sh1pt itself. Built from the `next-supabase` boilerplate + `waitlist-crypto-investor` recipe — pure dogfood.

## Local dev

```bash
cd sites/sh1pt.com
npm install

# in your Supabase project:
#   Database → SQL editor → paste supabase/schema.sql → run

cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EOF

npm run dev
# http://localhost:3000
```

## Ship

```bash
npx sh1pt promote ship --channel beta      # Cloudflare Pages preview on sh1pt.dev
npx sh1pt promote ship --channel stable    # live
```

## What's wired

- `/` — landing (hero, pricing, referral blurb)
- `/investors` — pitch, market, why-now, traction placeholders, team, contact
- `/waitlist` — email + handle form → Supabase `waitlist` table + referral code
- `/waitlist/thanks` — shows the new user's personal referral link
- `/r/[code]` — referral landing, stamps the ref code onto the waitlist form

## Once prepay is live

Extend `app/waitlist/thanks/page.tsx` with a "Lock in $244" CTA that calls `POST /api/checkout` → `PaymentProvider.createCheckout()` (default: CoinPay) and redirects to the hosted-checkout URL. Webhook lives at `/api/webhooks/payments`. The recipe prompts in `packages/recipes/waitlist-crypto-investor` describe the expected shape.
