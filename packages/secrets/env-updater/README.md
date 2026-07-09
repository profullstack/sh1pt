# Environment Updater

Orchestrates secret synchronization across multiple providers (.env files, Doppler, Railway, GitHub Secrets).

## What it does

- Pulls secrets from a source provider and pushes them to one or more target providers.
- Supports .env file management, Doppler, Railway, and GitHub Secrets out of the box.
- Provides diff functionality to compare secrets across providers.
- Filters keys via include/exclude glob patterns.
- Exports standalone helpers (`pullFrom`, `pushTo`, `syncEnv`, `diffEnv`, `readEnvFile`, `writeEnvFile`) for custom workflows.

## Package

- Name: `@profullstack/sh1pt-secrets-env-updater`
- Path: `packages/secrets/env-updater`
- Adapter ID: `secrets-env-updater`
- Homepage: https://sh1pt.com

## Scripts

- `build`: `tsc -p tsconfig.json`
- `prepublishOnly`: `pnpm build`
- `typecheck`: `tsc -p tsconfig.json --noEmit`

## Usage

```bash
pnpm add @profullstack/sh1pt-secrets-env-updater
```

### Sync .env to Doppler and GitHub Secrets

```ts
import { syncEnv } from '@profullstack/sh1pt-secrets-env-updater';

const results = await syncEnv(
  { secret: (k) => vault[k], log: console.log },
  { id: 'secrets-dotenvx', config: { envFile: '.env' } },
  [
    { id: 'secrets-doppler', config: { project: 'my-app', config: 'production' } },
    { id: 'secrets-github', config: { repo: 'owner/repo' } },
  ],
);
```

### Diff secrets between providers

```ts
import { diffEnv } from '@profullstack/sh1pt-secrets-env-updater';

const entries = await diffEnv(
  { secret: (k) => vault[k], log: console.log },
  { id: 'secrets-dotenvx', config: { envFile: '.env' } },
  { id: 'secrets-doppler', config: { project: 'my-app', config: 'production' } },
);
// entries: [{ key, sourceValue, targetValue, status: 'added' | 'removed' | 'changed' | 'unchanged' }]
```

## Development

```bash
pnpm --filter @profullstack/sh1pt-secrets-env-updater typecheck
```

Run tests from the repository root:

```bash
pnpm vitest run packages/secrets/env-updater/src/index.test.ts
```
