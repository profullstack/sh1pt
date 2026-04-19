# axum-supabase

Axum + Supabase sh1pt boilerplate (Rust). Waitlist + payments API with the default `waitlist-crypto-investor` recipe wired up. Release builds are single-binary and tiny — great for Fly machines and Docker scratch images.

```bash
cp -r boilerplates/axum-supabase my-api
cd my-api
cargo run

export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...

# ship:
npx sh1pt promote ship --channel beta    # default target: Fly.io
```

Defaults to CoinPay for payments. Flip `payments.providers.stripe.enabled = true` in `sh1pt.config.ts` for cards.
