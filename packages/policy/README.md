# @profullstack/sh1pt-policy

**Store-policy linter for [sh1pt](https://sh1pt.com) — catches rejections before submission.**

🌐 Homepage: **https://sh1pt.com**
📦 Source: **https://github.com/profullstack/sh1pt**

[![npm](https://img.shields.io/npm/v/@profullstack/sh1pt-policy)](https://www.npmjs.com/package/@profullstack/sh1pt-policy)
[![license](https://img.shields.io/npm/l/@profullstack/sh1pt-policy)](https://github.com/profullstack/sh1pt/blob/master/LICENSE)

Every store, registry, and CDN has its own submission rules. App Store rejects titles containing "free" or "beta". Google Play flags apps that ask for non-essential permissions. npm banishes packages with duplicate titles or spam keywords. Chrome Web Store kills submissions with placeholder bundle IDs.

sh1pt runs this linter **before every ship** so the rejection happens on your laptop, not after a 3-day review queue.

## Install

```bash
pnpm add @profullstack/sh1pt-policy
```

## Usage

You usually won't import this directly — `@profullstack/sh1pt` runs `lint()` automatically in `sh1pt promote ship` and `sh1pt ship lint`. For programmatic use:

```ts
import { lint } from '@profullstack/sh1pt-policy';
import type { Manifest } from '@profullstack/sh1pt-core';

const result = await lint(manifest, { strict: true });
if (result.errors.length > 0) {
  for (const e of result.errors) {
    console.error(`${e.rule}: ${e.message} (${e.target ?? 'all targets'})`);
  }
  process.exit(1);
}
```

## What it catches

- **Banned keywords** — "free", "best", "#1", etc. (App Store), emoji-overload titles (HN), all-caps (most stores)
- **Identifier collisions** — duplicate bundle ids, npm names already taken, Chrome extension IDs
- **Spammy submission rate** — more than N submissions/day to the same store triggers a soft rate-limit you should respect, or a permanent ban if you don't
- **Invalid bundle IDs / reverse-DNS format** — `com.example.app` is fine, `myapp` is not
- **Missing required fields** — privacy policy URL, support email, screenshots per platform
- **Description/title length limits** per platform
- **Prohibited targeting** (Reddit Ads has a long list, TikTok has a different one)

The policy linter ships with rule packs for every adapter sh1pt supports — contributors add rules as they learn them from real store rejections across the customer base.

## Links

- sh1pt: https://sh1pt.com
- Source + issue tracker: https://github.com/profullstack/sh1pt
- The CLI that uses this: [@profullstack/sh1pt](https://www.npmjs.com/package/@profullstack/sh1pt)
- Core interfaces: [@profullstack/sh1pt-core](https://www.npmjs.com/package/@profullstack/sh1pt-core)

## License

MIT
