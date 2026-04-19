import { defineTarget } from '@sh1pt/core';

// JS/TS CDNs. Most auto-mirror npm, so "publish to CDN" = "publish to
// npm + verify it resolves." Only cdnjs requires an explicit submission
// (PR against cdnjs/packages).
type Mirror = 'jsdelivr' | 'unpkg' | 'esm.sh' | 'cdnjs' | 'skypack' | 'jspm';

interface Config {
  packageName: string;                 // npm package name
  mirrors: Mirror[];
  // cdnjs submission inputs (only if 'cdnjs' in mirrors)
  cdnjs?: { autoupdateSource: 'npm' | 'git'; sourceRepo?: string };
}

const URL_FOR: Record<Mirror, (pkg: string, v: string) => string> = {
  jsdelivr: (pkg, v) => `https://cdn.jsdelivr.net/npm/${pkg}@${v}/`,
  unpkg: (pkg, v) => `https://unpkg.com/${pkg}@${v}/`,
  'esm.sh': (pkg, v) => `https://esm.sh/${pkg}@${v}`,
  cdnjs: (pkg, v) => `https://cdnjs.cloudflare.com/ajax/libs/${pkg}/${v}/`,
  skypack: (pkg, v) => `https://cdn.skypack.dev/${pkg}@${v}`,
  jspm: (pkg, v) => `https://ga.jspm.io/npm:${pkg}@${v}/`,
};

export default defineTarget<Config>({
  id: 'pkg-cdn',
  kind: 'package-manager',
  label: 'JS/TS CDN mirrors (jsDelivr / unpkg / esm.sh / cdnjs / Skypack / JSPM)',
  async build(ctx, config) {
    ctx.log(`no-op build — CDN mirrors consume the published npm tarball (pkg=${config.packageName})`);
    return { artifact: `${ctx.outDir}/cdn-manifest.json` };
  },
  async ship(ctx, config) {
    const urls = config.mirrors.map((m) => URL_FOR[m](config.packageName, ctx.version));
    ctx.log(`cdn mirrors:\n  ${urls.join('\n  ')}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { urls } };
    // TODO:
    //  - for each auto-mirror: HEAD request to confirm URL resolves (may take ~minutes after npm publish)
    //  - if 'cdnjs' in mirrors: clone cdnjs/packages, write packages/<pkg>.json with
    //    autoupdate config, open PR via GH_TOKEN
    return { id: `${config.packageName}@${ctx.version}`, meta: { urls } };
  },
  async status(id) {
    return { state: 'live', version: id };
  },
});
