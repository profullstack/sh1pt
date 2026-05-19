# @profullstack/sh1pt-target-pkg-cdn

**JS/TS CDN mirror target for [sh1pt](https://sh1pt.com).**

🌐 Homepage: **https://sh1pt.com**
📦 Source: **https://github.com/profullstack/sh1pt**

Validates that your npm package resolves on CDN mirrors (jsDelivr, unpkg, esm.sh, cdnjs, Skypack, JSPM) after publishing. Most CDNs auto-mirror from npm, so "shipping to CDN" really means: publish to npm first, then verify the package is reachable on each CDN.

## Install

```bash
pnpm add @profullstack/sh1pt-target-pkg-cdn
```

## Configuration

```ts
interface Config {
  /** npm package name (required) */
  packageName: string;
  /** CDN mirrors to check (required, at least one) */
  mirrors: Mirror[];
  /** cdnjs submission options (only if 'cdnjs' is in mirrors) */
  cdnjs?: {
    autoupdateSource: 'npm' | 'git';
    sourceRepo?: string;
    libraryName?: string;
  };
}

type Mirror = 'jsdelivr' | 'unpkg' | 'esm.sh' | 'cdnjs' | 'skypack' | 'jspm';
```

## Usage

### Basic: verify your package on jsDelivr + unpkg

```ts
// sh1pt.config.ts
export default {
  targets: {
    'pkg-cdn': {
      packageName: '@acme/ui',
      mirrors: ['jsdelivr', 'unpkg'],
    },
  },
};
```

### Full: all mirrors with cdnjs config

```ts
{
  packageName: '@acme/ui',
  mirrors: ['jsdelivr', 'unpkg', 'esm.sh', 'cdnjs', 'skypack', 'jspm'],
  cdnjs: {
    autoupdateSource: 'npm',
    libraryName: 'acme-ui',
    sourceRepo: 'https://github.com/acme/ui',
  },
}
```

## How it works

### Build phase

`sh1pt build` generates a `cdn-manifest.json` in your output directory with resolved CDN URLs for each mirror:

```json
{
  "provider": "pkg-cdn",
  "packageName": "@acme/ui",
  "version": "1.2.3",
  "mirrors": [
    { "mirror": "jsdelivr", "url": "https://cdn.jsdelivr.net/npm/@acme/ui@1.2.3/", "source": "npm", "autoMirrored": true },
    { "mirror": "unpkg", "url": "https://unpkg.com/@acme/ui@1.2.3/", "source": "npm", "autoMirrored": true },
    { "mirror": "cdnjs", "url": "https://cdnjs.cloudflare.com/ajax/libs/acme-ui/1.2.3/", "source": "manual", "autoMirrored": false }
  ]
}
```

### Ship phase

`sh1pt ship` HEAD-requests each CDN URL to verify the package resolves. If any mirror returns a non-OK status, the ship fails with a descriptive error.

- **Auto-mirrored CDNs** (jsDelivr, unpkg, esm.sh, Skypack, JSPM): serve directly from npm — no extra steps after `npm publish`
- **cdnjs**: requires a manual submission PR to the [cdnjs/packages](https://github.com/cdnjs/packages) repo

## Supported CDNs

| CDN | URL pattern | Auto-mirrored | Notes |
|---|---|---|---|
| jsDelivr | `cdn.jsdelivr.net/npm/{pkg}@{ver}/` | ✅ | Most popular, global edge network |
| unpkg | `unpkg.com/{pkg}@{ver}/` | ✅ | Simple, reliable |
| esm.sh | `esm.sh/{pkg}@{ver}` | ✅ | ESM-first, Deno-compatible |
| cdnjs | `cdnjs.cloudflare.com/ajax/libs/{name}/{ver}/` | ❌ | Requires manual PR to cdnjs/packages |
| Skypack | `cdn.skypack.dev/{pkg}@{ver}` | ✅ | Optimized for browsers |
| JSPM | `ga.jspm.io/npm:{pkg}@{ver}/` | ✅ | Import map friendly |

## Links

- sh1pt: https://sh1pt.com
- jsDelivr: https://www.jsdelivr.com
- unpkg: https://unpkg.com
- esm.sh: https://esm.sh
- cdnjs: https://cdnjs.com
- Source + issues: https://github.com/profullstack/sh1pt

## License

MIT