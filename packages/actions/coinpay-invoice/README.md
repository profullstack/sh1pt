# CoinPayPortal Invoice Bot

Installs the [`coinpaybot`](https://github.com/profullstack/coinpaybot) GitHub Action so maintainers can create CoinPayPortal crypto invoices and payment links straight from issue and PR comments:

```
/coinpay invoice 250 USD --crypto usdc_pol --for "Milestone 1"
```

The bot replies with a payable `…/pay/{id}` link. Owners/members/collaborators create invoices directly; other contributors create a pending request a maintainer approves with `/coinpay approve`.

## Requirements

Add two repository secrets before use:

- `COINPAY_API_KEY` — a CoinPayPortal API key (`cp_live_...`).
- `COINPAY_BUSINESS_ID` — the CoinPayPortal business that owns the receiving wallet.

The business must have a receiving wallet configured for the crypto you invoice in (e.g. `usdc_pol`), or payment creation fails.

## Inputs

- `actionRef` (default `profullstack/coinpaybot@v0`) — the action reference to run.
- `coinpayBaseUrl` (default `https://coinpayportal.com`) — CoinPayPortal base URL.

## Output

`coinpay-invoice` writes `.github/workflows/coinpay.yml` through a pull request.
