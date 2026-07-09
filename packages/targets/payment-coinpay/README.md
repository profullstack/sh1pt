# @profullstack/sh1pt-target-payment-coinpay

**CoinPay payment target for [sh1pt](https://sh1pt.com).**

🌐 Homepage: **https://sh1pt.com**
📦 Source: **https://github.com/profullstack/sh1pt**

Wraps the CoinPay CLI (`@profullstack/coinpay`) as a sh1pt target, letting you create, retrieve, and list crypto payments — or check exchange rates — directly from your sh1pt pipeline.

## Install

```bash
pnpm add @profullstack/sh1pt-target-payment-coinpay
```

## Prerequisites

- **CoinPay CLI** — installed globally via `npm install -g @profullstack/coinpay`, or the adapter auto-installs it during `build`
- **COINPAY_API_KEY** — set via `sh1pt secret set COINPAY_API_KEY <key>` or `coinpay config set-key <key>`

## Configuration

```ts
interface Config {
  /** Command to execute: 'create' | 'get' | 'list' | 'rates' (default: 'create') */
  command?: 'create' | 'get' | 'list' | 'rates';
  /** Additional CLI arguments */
  args?: Record<string, unknown>;
  /** Business ID for multi-merchant setups */
  businessId?: string;
  /** Payment description */
  description?: string;
}
```

## Usage

### Create a payment

```ts
// sh1pt.config.ts
export default {
  targets: {
    'payment-coinpay': {
      command: 'create',
      args: {
        amount: 2500,        // amount in cents ($25.00)
        blockchain: 'base',  // blockchain network
      },
      description: 'Invoice #1234',
    },
  },
};
```

### Get a payment

```ts
{
  command: 'get',
  args: { paymentId: 'cp_abc123' },
}
```

### List payments

```ts
{
  command: 'list',
  businessId: 'biz_456',
}
```

### Check exchange rates

```ts
{
  command: 'rates',
  args: { coin: 'BTC', fiat: 'USD' },
}
```

## CLI commands reference

| sh1pt command | CoinPay CLI equivalent |
|---|---|
| `sh1pt build` | Verifies `coinpay` is installed and API key is configured |
| `sh1pt ship` (create) | `coinpay payment create --amount X --blockchain Y` |
| `sh1pt ship` (get) | `coinpay payment get <paymentId>` |
| `sh1pt ship` (list) | `coinpay payment list [--business-id Z]` |
| `sh1pt ship` (rates) | `coinpay rates get BTC --fiat USD` |

## Setup

```bash
sh1pt targets payment-coinpay setup
```

The setup guide will walk you through:

1. Installing the CoinPay CLI: `npm install -g @profullstack/coinpay`
2. Getting an API key from your CoinPay dashboard → API Keys
3. Configuring the key: `coinpay config set-key <key>` or `sh1pt secret set COINPAY_API_KEY <key>`

## Links

- sh1pt: https://sh1pt.com
- CoinPay CLI: https://www.npmjs.com/package/@profullstack/coinpay
- CoinPay docs: https://coinpayportal.com/docs/sdk#cli
- Source + issues: https://github.com/profullstack/sh1pt

## License

MIT