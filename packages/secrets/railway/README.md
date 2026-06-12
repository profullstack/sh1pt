# Railway Secrets

Provides the Railway service variables module for sh1pt.

## What it does

- Lists Railway service variables with `railway variable list --json`.
- Pushes variable values with `railway variable set` without logging secret values.
- Supports optional Railway service and environment scopes.
- Supports `--skip-deploys` for staged secret updates.

## Package

- Name: `@profullstack/sh1pt-secrets-railway`
- Path: `packages/secrets/railway`
- Adapter ID: `secrets-railway`
- Homepage: https://sh1pt.com

## Scripts

- `build`: `tsc -p tsconfig.json`
- `prepublishOnly`: `pnpm build`
- `typecheck`: `tsc -p tsconfig.json --noEmit`

## Usage

```bash
pnpm add @profullstack/sh1pt-secrets-railway
```

## Development

```bash
pnpm --filter @profullstack/sh1pt-secrets-railway typecheck
pnpm vitest run packages/secrets/railway/src/index.test.ts
```
