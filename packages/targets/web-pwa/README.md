# @profullstack/sh1pt-target-web-pwa

Target adapter for packaging a web app as a Progressive Web App (PWA): manifest, service worker, icon assets, and installability checks.

## Setup

1. Add a web app manifest and icon set to your app's public assets.
2. Register a service worker from your app shell.
3. Set `manifestPath`, `serviceWorkerPath`, and `startUrl` in the sh1pt target config.
4. Run a dry run first to verify the generated PWA artifact path.

## Example

```ts
targets: {
  pwa: {
    use: 'web-pwa',
    manifestPath: 'public/manifest.webmanifest',
    serviceWorkerPath: 'public/sw.js',
    startUrl: '/',
  },
}
```
