# sh1pt

**Ship one codebase to every platform, store, and registry.**

`sh1pt` is Expo for *everywhere*: web, mobile (iOS/Android), desktop (macOS/Windows/Linux), wearables, TV, browser extensions, CLIs, SDKs, package managers, voice assistants, chatbots, IoT — all driven by one manifest, one CLI, and one cloud.

## Who it's for

**AI agent builders** generating apps at volume. Give an agent one API + one manifest, get a live listing on every store and registry without it learning 30 publishing pipelines.

## Pricing

**$499/year** for the managed cloud — build runners (Linux + macOS + Windows), credentials vault, store submission monitoring, webhook alerts, policy linter, rate-limit protection. Self-host core is OSS.

## The DX goal

Expo-style, but with **minimum prompting**. The config file is the source of truth, not an interactive wizard.

```bash
sh1pt init                    # scaffold sh1pt.config.ts
sh1pt setup                   # wire every store/registry — OAuth where possible,
                              # paste-once keys where not, deep links for human-only steps
sh1pt setup status            # which stores are live / pending / blocked

sh1pt ship --channel beta     # publish to test tracks on every target
sh1pt ship --channel stable   # promote to production stores
```

`sh1pt setup` is the killer command: run it once, connect every store in parallel, walk away. Human-only steps (Apple D-U-N-S, Google Play identity verification, Microsoft Partner Center review) become a tracked checklist with deep links, polled automatically.

## Layout

```
sh1pt/
├── sh1pt.config.ts       This repo ships ONE thing — the CLI — to every package manager.
│                         This config dogfoods sh1pt to publish itself.
├── packages/             Workspace members — what this repo actually produces.
│   ├── core/             Target plugin interface, manifest schema, registry
│   ├── cli/              `sh1pt` CLI (the single user-facing artifact)
│   ├── sdk/              Programmatic JS/TS SDK
│   ├── api/              SaaS backend (Hono) — projects, releases, builds, credentials, agents
│   ├── policy/           Store-policy linter (runs before every ship)
│   ├── web/              Dashboard (stub)
│   └── targets/          One adapter per distribution surface
│       ├── pkg-npm/
│       ├── pkg-homebrew/
│       ├── mobile-ios/
│       ├── desktop-mac/
│       ├── desktop-win/
│       ├── desktop-linux/
│       ├── browser-chrome/
│       ├── web-static/
│       ├── tv-tvos/         Apple TV
│       ├── tv-firetv/       Fire TV / Firestick
│       ├── tv-roku/         Roku (⚠ BrightScript, not JS/React)
│       ├── tv-androidtv/    Android TV
│       ├── tv-webos/        LG webOS
│       ├── xr-webxr/        WebXR (universal)
│       ├── xr-meta-quest/   Meta Horizon Store (Quest)
│       ├── xr-sidequest/    SideQuest (Quest sideload)
│       ├── xr-visionos/     Apple Vision Pro
│       ├── xr-pico/         Pico Store (ByteDance)
│       ├── xr-steamvr/      SteamVR (PCVR / OpenXR)
│       ├── console-steam/   Steam + Steam Deck (SteamOS)
│       └── pkg-fdroid/      F-Droid (FOSS Android repo)
├── boilerplates/         Standalone starter projects (NOT workspace members).
│   └── hello-world/      Customers copy this and edit sh1pt.config.ts.
└── TARGETS.md            Full matrix of ~40 planned surfaces, stores, and registries
```

## What this repo publishes

Just the CLI. `sh1pt.config.ts` at the root uses sh1pt itself to fan the CLI out to every package manager — `npm install -g @sh1pt/cli`, `brew install sh1pt`, `winget install sh1pt`, `scoop install sh1pt`, etc. Lib packages (`@sh1pt/core`, `@sh1pt/sdk`, `@sh1pt/policy`, target adapters) ride along on npm so `sh1pt init` and target plugins can pull them at runtime.

## Concepts

- **Manifest** (`sh1pt.config.ts`): declares a project and which **targets** it ships to.
- **Target**: a plugin that knows how to `build`, `ship`, `status`, and `rollback` for one surface.
- **Release**: a versioned build destined for one or more targets on a given **channel** (`stable` / `beta` / `canary`).
- **Channel → store track mapping**: `beta` routes to TestFlight on iOS, Play internal track on Android, Chrome Web Store testing, etc. `stable` promotes to production.
- **Policy linter** (`@sh1pt/policy`): runs before every ship. Catches duplicate titles, banned keywords, bad bundle ids, and spammy submission rate *before* the store rejects you (or flags the account).
- **Cloud**: projects, secrets vault, build queue with per-OS runners, release history, live status dashboards, inbound webhooks from store APIs, outbound webhooks to your systems.

## Agent-first API

For programmatic use from LLM agents, one call publishes everywhere:

```ts
POST /v1/agents/publish
{
  "name": "...", "version": "...",
  "targets": [{ "use": "mobile-ios", "config": {...} }, ...],
  "secrets": { "NPM_TOKEN": "..." },
  "channel": "beta"
}
```

Also `POST /v1/agents/bulk-publish` for fan-out across many projects, and `GET /v1/agents/quota` for the $499 plan limits.

See [TARGETS.md](./TARGETS.md) for the full surface matrix.
