# @profullstack/sh1pt-core

**Core interfaces and contract-test runners for [sh1pt](https://sh1pt.com) adapters.**

🌐 Homepage: **https://sh1pt.com**
📦 Source: **https://github.com/profullstack/sh1pt**

[![npm](https://img.shields.io/npm/v/@profullstack/sh1pt-core)](https://www.npmjs.com/package/@profullstack/sh1pt-core)
[![license](https://img.shields.io/npm/l/@profullstack/sh1pt-core)](https://github.com/profullstack/sh1pt/blob/master/LICENSE)
[![github](https://img.shields.io/github/stars/profullstack/sh1pt?style=social)](https://github.com/profullstack/sh1pt)

sh1pt is the single command between an idea and global distribution — one codebase → every store, registry, CDN, ad network, cloud provider, and channel. This package is its foundation: the plugin contract every adapter implements, plus the test runners that verify adapters behave.

## Install

```bash
pnpm add @profullstack/sh1pt-core
# or: npm i, bun add, deno add npm:
```

## Who this is for

You only need this package directly if you're **authoring a sh1pt adapter** — a social platform, a cloud provider, a payment processor, a package registry. If you just want to use sh1pt, install [`@profullstack/sh1pt`](https://www.npmjs.com/package/@profullstack/sh1pt) instead.

## What's in the box

- **~16 adapter interfaces** — `Target`, `SocialPlatform`, `Bot`, `BridgeNetwork`, `CloudProvider`, `DnsProvider`, `MerchProvider`, `PaymentProvider`, `AdPlatform`, `VcsProvider`, `AgentCLI`, `CaptchaSolver`, `WebhookTarget`, `DocProvider`, `JurisdictionPack`, `Recipe`
- **`defineXxx()` constructors** — type-safe factories every adapter uses as its `export default`
- **`setup()` helpers** — `webhookUrlSetup`, `tokenSetup`, `oauthSetup`, `manualSetup`, plus the `SetupContext` / `SetupResult` types every adapter uses to auto-persist config to `~/.config/sh1pt/config.json`
- **Contract-test runners** under `@profullstack/sh1pt-core/testing` — one-line test setup per adapter

## Minimal example: authoring an adapter

```ts
import { defineSocial, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  username: string;
}

export default defineSocial<Config>({
  id: 'social-my-platform',
  label: 'My Platform',
  requires: { maxBodyChars: 500 },

  async connect(ctx, config) {
    if (!ctx.secret('MY_PLATFORM_TOKEN')) {
      throw new Error('MY_PLATFORM_TOKEN not in vault');
    }
    return { accountId: config.username };
  },

  async post(ctx, post, config) {
    ctx.log(`posting ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'my-platform', publishedAt: new Date().toISOString() };
    // … real API call …
    return { id: `mp_${Date.now()}`, url: '…', platform: 'my-platform', publishedAt: new Date().toISOString() };
  },

  setup: tokenSetup({
    secretKey: 'MY_PLATFORM_TOKEN',
    label: 'My Platform',
    vendorDocUrl: 'https://my-platform.example.com/developers',
    steps: [
      'Go to the developer console',
      'Create an API token with post scope',
      'Copy the token (shown once)',
    ],
  }),
});
```

## Contract tests

Every adapter that implements an interface should run the matching contract-test runner. One line in your test file:

```ts
// packages/social/my-platform/src/index.test.ts
import { contractTestSocial } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { username: 'testuser' },
  requiredSecrets: ['MY_PLATFORM_TOKEN'],
});
```

The runner verifies:

- `id` and `label` are present and correctly namespaced
- `connect()` throws a vault-hint error when required secrets are missing
- `dry-run` mode never hits the network
- Return shapes match the declared types
- Interface-specific guardrails (GPU cloud providers enforce `--max-hourly-price`, social adapters with `requires.media` reject posts without media, etc.)

## Config store

`@profullstack/sh1pt-core` also exports the JSON-on-disk config store every adapter's `setup()` writes to:

```ts
import { getAdapterConfig, setAdapterConfig, configPath } from '@profullstack/sh1pt-core';

const cfg = await getAdapterConfig<MyConfig>('social-my-platform');
await setAdapterConfig('social-my-platform', { username: 'sh1pt' });
console.log('config lives at', configPath()); // ~/.config/sh1pt/config.json
```

Atomic writes, 0600 perms, respects `XDG_CONFIG_HOME`.

## Links

- sh1pt: https://sh1pt.com
- Source: https://github.com/profullstack/sh1pt
- Issues: https://github.com/profullstack/sh1pt/issues

## License

MIT
