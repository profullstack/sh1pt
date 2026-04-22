# @profullstack/sh1pt

**Build. Promote. Scale. Iterate…**

One codebase → every store, registry, CDN, and channel. Ads on every network. Cloud infra on demand. AI agents tighten the loop. sh1pt is the single command between an idea and global distribution.

🌐 Homepage: **https://sh1pt.com**
📦 Source: **https://github.com/profullstack/sh1pt**

[![npm](https://img.shields.io/npm/v/@profullstack/sh1pt)](https://www.npmjs.com/package/@profullstack/sh1pt)
[![license](https://img.shields.io/npm/l/@profullstack/sh1pt)](https://github.com/profullstack/sh1pt/blob/master/LICENSE)
[![github](https://img.shields.io/github/stars/profullstack/sh1pt?style=social)](https://github.com/profullstack/sh1pt)

## Install

```bash
curl -fsSL https://sh1pt.com/install.sh | sh
```

Or pick your own runtime:

```bash
pnpm add     -g @profullstack/sh1pt      # or
bun  install -g @profullstack/sh1pt      # or
npm  install -g @profullstack/sh1pt      # or
deno install -g -A -f -n sh1pt npm:@profullstack/sh1pt
```

Runs on **Node** 22+, **Bun** 1.1+, **Deno** 2.0+.

## Four verbs

```bash
sh1pt build          # compile artifacts for every target you configured
sh1pt promote        # publish (ship), run ads, print swag, pitch investors
sh1pt scale          # provision cloud infra, DNS round-robin, rollouts, cost ceilings
sh1pt iterate        # observe metrics → agent proposes diffs → ship → measure, on loop
```

## Filesystem-mirrored adapter commands

Every `packages/<category>/<name>/` in the sh1pt monorepo is a CLI command:

```bash
sh1pt bots discord setup            # set up the Discord bot adapter
sh1pt social x setup                # X (Twitter) organic posting
sh1pt webhooks slack setup          # Slack incoming webhook
sh1pt cloud runpod setup            # RunPod GPU instances
sh1pt payments stripe setup         # Stripe checkout
sh1pt targets pkg-npm setup         # npm publish target
sh1pt vcs github setup              # GitHub releases / PRs
# … and ~170 more across 17 categories …
```

Every adapter's `setup` command:

1. Tries the fastest auth path (webhook URL paste → API key paste → OAuth → manual instructions)
2. Writes its config to `~/.config/sh1pt/config.json` under `adapters.<id>`
3. Falls back to printed instructions with vendor URLs if it can't automate a step

List everything in a category:

```bash
sh1pt social list
sh1pt bots list
sh1pt targets list
```

## Minimum viable project

```bash
mkdir my-app && cd my-app
sh1pt config stack set             # prompts: node / bun / python / rust
sh1pt ship init                    # scaffolds sh1pt.config.ts
# declare targets in sh1pt.config.ts …
sh1pt promote ship --channel beta  # build + lint + submit everywhere
```

## Links

- sh1pt: https://sh1pt.com
- Source + issue tracker: https://github.com/profullstack/sh1pt
- Core interfaces: [@profullstack/sh1pt-core](https://www.npmjs.com/package/@profullstack/sh1pt-core)
- Policy linter: [@profullstack/sh1pt-policy](https://www.npmjs.com/package/@profullstack/sh1pt-policy)

## License

MIT
