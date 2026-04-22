import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// WebXR is the universal XR path — works on Quest Browser, Vision Pro
// Safari, Chrome+headset, and any other WebXR-capable UA. Deploy like a
// static site, but with immersive-session headers + HTTPS enforcement.
interface Config {
  dir: string;
  provider: 'cloudflare-pages' | 'netlify' | 's3-cloudfront' | 'vercel';
  domain?: string;
  immersiveModes: ('immersive-vr' | 'immersive-ar' | 'inline')[];
  launchCatalogs?: ('quest-browser' | 'vision-pro' | 'webxr-directory')[]; // optional listings
}

export default defineTarget<Config>({
  id: 'xr-webxr',
  kind: 'xr',
  label: 'WebXR (browser-native VR/AR)',
  async build(ctx, config) {
    ctx.log(`prepare WebXR bundle · modes=${config.immersiveModes.join(',')}`);
    // TODO:
    //  - verify page declares feature-policy / permissions-policy for xr-spatial-tracking
    //  - validate HTTPS config — WebXR won't start over plain HTTP
    //  - inject launch manifest so headset browsers can preview inline
    return { artifact: config.dir };
  },
  async ship(ctx, config) {
    ctx.log(`deploy to ${config.provider}${config.domain ? ` → ${config.domain}` : ''}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: dispatch to per-provider deploy; submit to headset launch catalogs if requested
    return { id: `webxr:${ctx.version}`, url: config.domain ? `https://${config.domain}` : undefined };
  },

  setup: manualSetup({
    label: "WebXR",
    steps: [
      "WebXR has no \"store\" \u2014 it runs in any WebXR-capable browser",
      "Publish as a regular web app via web-static / deploy-workers / deploy-fly",
      "No authentication required for WebXR itself",
    ],
  }),
});
