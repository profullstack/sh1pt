# GitHub Secrets

Provides the GitHub Actions secrets module for sh1pt.

## What it does

- Lists repository, environment, organization, or user secret names with `gh secret list`.
- Pushes secret values with `gh secret set` without logging secret values.
- Supports GitHub Actions, Agents, Codespaces, and Dependabot secret scopes exposed by GitHub CLI.

## Package

- Name: `@profullstack/sh1pt-secrets-github`
- Path: `packages/secrets/github`
- Adapter ID: `secrets-github`
- Homepage: https://sh1pt.com

## Scripts

- `build`: `tsc -p tsconfig.json`
- `prepublishOnly`: `pnpm build`
- `typecheck`: `tsc -p tsconfig.json --noEmit`

## Usage

```bash
pnpm add @profullstack/sh1pt-secrets-github
```

## Development

```bash
pnpm --filter @profullstack/sh1pt-secrets-github typecheck
pnpm vitest run packages/secrets/github/src/index.test.ts
```
