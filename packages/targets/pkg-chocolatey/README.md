# Chocolatey Community Repository

Provides the Chocolatey Community Repository sh1pt target adapter, enabling automated
`.nuspec` manifest and `chocolateyInstall.ps1` generation and publishing.

## What it does

- Generates a valid `.nuspec` XML manifest for your package
- Generates a `tools/chocolateyInstall.ps1` script to download and install your app
- Publishes the `.nupkg` to the [Chocolatey Community Repository](https://community.chocolatey.org)
  via your API key

## Package

- Name: `@profullstack/sh1pt-target-pkg-chocolatey`
- Path: `packages/targets/pkg-chocolatey`
- Adapter ID: `pkg-chocolatey`
- Homepage: https://sh1pt.com

## Scripts

- `build`: `tsc -p tsconfig.json`
- `prepublishOnly`: `pnpm build`
- `typecheck`: `tsc -p tsconfig.json --noEmit`

## Setup

```bash
sh1pt secret set CHOCOLATEY_API_KEY <your-api-key>
```

1. Create a free account at [community.chocolatey.org](https://community.chocolatey.org)
2. Generate an API key under your account settings
3. Run the `sh1pt secret set` command above

See the [Chocolatey package creation docs](https://docs.chocolatey.org/en-us/create/create-packages)
for more detail.

## Usage

```bash
pnpm add @profullstack/sh1pt-target-pkg-chocolatey
```
