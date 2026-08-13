# WordPress (wp-cli)

Ships a WordPress plugin or theme to a live WordPress install using
[wp-cli](https://github.com/wp-cli/wp-cli) — `wp dist-archive` builds the zip,
`wp plugin install --activate` puts it on the site.

## What it does

- `build` packages the plugin/theme source into `<slug>-<version>.zip` with `wp dist-archive`, installing `wp-cli/dist-archive-command` first if the site's wp-cli doesn't have it.
- `ship` runs `wp <plugin|theme> install <zip> --force --activate` against the install named by `ssh` or `path`, then reads back the version the site ended up on.
- `status` reports the shipped version and the site URL.
- Dry runs write a `wordpress-package.json` plan and never exec wp-cli.

## Package

- Name: `@profullstack/sh1pt-target-deploy-wordpress`
- Path: `packages/targets/deploy-wordpress`
- Adapter ID: `deploy-wordpress`
- Homepage: https://sh1pt.com

## Configuration

| Key | Required | Default | Notes |
|---|---|---|---|
| `slug` | yes | — | Plugin/theme directory name as WordPress knows it |
| `type` | no | `plugin` | `plugin` or `theme` |
| `sourceDir` | no | project root | Source dir to archive, relative to the project |
| `ssh` | one of | — | `wp --ssh=[<user>@]<host>[:<port>][<path>]` for a remote site |
| `path` | one of | — | `wp --path=<dir>` for a WordPress root on this machine |
| `url` | no | — | `wp --url=<url>`, for multisite |
| `siteUrl` | no | `url` | Public URL reported back on ship |
| `activate` | no | `true` | Set `false` to install without activating |

`ship` requires `ssh` or `path` — sh1pt will not guess which WordPress install
to write to. Authentication is your SSH agent's job; no token goes in the vault.

```ts
// sh1pt.config.ts
{
  target: 'deploy-wordpress',
  config: {
    slug: 'acme-widgets',
    sourceDir: 'plugins/acme-widgets',
    ssh: 'deploy@example.com:/var/www/html',
    siteUrl: 'https://example.com',
  },
}
```

## Prerequisites

```bash
brew install wp-cli                              # or the phar: https://wp-cli.org/#installing
wp package install wp-cli/dist-archive-command   # build step installs this if missing
wp core version --ssh=deploy@example.com:/var/www/html
```

## Scripts

- `build`: `tsc -p tsconfig.json`
- `prepublishOnly`: `pnpm build`
- `typecheck`: `tsc -p tsconfig.json --noEmit`

## Usage

```bash
pnpm add @profullstack/sh1pt-target-deploy-wordpress
```

## Development

```bash
pnpm --filter @profullstack/sh1pt-target-deploy-wordpress typecheck
pnpm vitest run packages/targets/deploy-wordpress/src/index.test.ts
```
