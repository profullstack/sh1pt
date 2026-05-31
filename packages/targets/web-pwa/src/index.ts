import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  manifestPath: string;
  serviceWorkerPath?: string;
  startUrl?: string;
  scope?: string;
  display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';
  iconsDir?: string;
}

export default defineTarget<Config>({
  id: 'web-pwa',
  kind: 'web',
  label: 'Progressive Web App',
  async build(ctx, config) {
    const startUrl = config.startUrl ?? '/';
    const scope = config.scope ?? startUrl;
    ctx.log(`package PWA manifest ${config.manifestPath} with start_url ${startUrl} and scope ${scope}`);
    if (config.serviceWorkerPath) {
      ctx.log(`include service worker ${config.serviceWorkerPath}`);
    }
    if (config.iconsDir) {
      ctx.log(`include PWA icons from ${config.iconsDir}`);
    }
    // TODO: validate manifest fields, service worker registration, and Lighthouse installability.
    return { artifact: `${ctx.outDir}/pwa-${ctx.version}.zip` };
  },
  async ship(ctx, config) {
    const startUrl = config.startUrl ?? '/';
    ctx.log(`prepare PWA release metadata for ${startUrl}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: publish generated PWA bundle to the configured web-static/deploy target.
    return {
      id: `web-pwa@${ctx.version}`,
      url: startUrl,
    };
  },
  async status(id) {
    return { state: 'live', url: id.includes('@') ? undefined : id };
  },
  setup: manualSetup({
    label: 'Progressive Web App',
    vendorDocUrl: 'https://web.dev/explore/progressive-web-apps',
    steps: [
      'Create a web app manifest with name, icons, start_url, scope, and display mode',
      'Register a service worker for offline/navigation fallback behavior',
      'Serve the app over HTTPS with correct manifest and service-worker headers',
      'Run Lighthouse or browser installability checks before production publish',
    ],
  }),
});
