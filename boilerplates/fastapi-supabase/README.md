# fastapi-supabase

FastAPI + Supabase sh1pt boilerplate (Python 3.11+). Waitlist + auth + payments API with the default `waitlist-crypto-investor` recipe wired up.

```bash
cp -r boilerplates/fastapi-supabase my-api
cd my-api
python -m venv .venv && source .venv/bin/activate
pip install -e .
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...     # server-only, never ship to client
uvicorn app.main:app --reload

# ship:
npx sh1pt promote ship --channel beta    # default target: Fly.io
```

Defaults to CoinPay for payments (crypto early-access prepays). Flip `payments.providers.stripe.enabled = true` in `sh1pt.config.ts` for cards.
