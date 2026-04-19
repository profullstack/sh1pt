# sh1pt

Ship one codebase to every platform, store, and registry.

`sh1pt` is a build + distribution layer — Expo-style, but for **every** surface: web, mobile, desktop, wearables, TV, browser extensions, CLIs, SDKs, package managers, voice assistants, chatbots, IoT, and more.

**Who it's for:** AI agent builders who generate apps at volume and need to ship them to every store and registry without learning 30 publishing pipelines. Give an agent one API + one manifest, get a live listing everywhere.

**Cloud:** $499/year for the managed version (build runners, credentials vault, store submission monitoring, webhook alerts). Self-host core is OSS.

## Layout

```
sh1pt/
├── packages/
│   ├── core/             Target plugin interface, manifest schema, registry
│   ├── cli/              `sh1pt` CLI
│   ├── sdk/              Programmatic JS/TS SDK (stub)
│   ├── api/              SaaS backend (Hono) — projects, releases, builds, credentials
│   ├── web/              Dashboard (stub)
│   ├── hello-world/      Example project with sh1pt.config.ts
│   └── targets/          One adapter per distribution surface
│       ├── pkg-npm/
│       ├── pkg-homebrew/
│       ├── mobile-ios/
│       ├── browser-chrome/
│       └── web-static/
└── TARGETS.md            Full matrix of surfaces, stores, and registries
```

## Concepts

- **Manifest** (`sh1pt.config.ts`): declares a project and which **targets** it ships to.
- **Target**: a plugin that knows how to `build`, `ship`, `status`, and `rollback` for one surface.
- **Release**: a versioned build destined for one or more targets on a given **channel** (stable/beta/canary).
- **Cloud**: projects, secrets (credentials vault), build queue, release history, status dashboards, webhooks.

## Quick start (once implemented)

```bash
pnpm install
pnpm --filter @sh1pt/cli build
npx sh1pt init
npx sh1pt target add pkg-npm
npx sh1pt ship --channel beta
```

Every `ship` runs the **policy linter** (`@sh1pt/policy`) first — catches store-policy problems (duplicate titles, banned keywords, bad bundle ids, spammy submission rate) before they become rejections or account flags. Critical when agents are generating apps at volume.

See [TARGETS.md](./TARGETS.md) for the full surface matrix.
