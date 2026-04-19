import { defineTarget } from '@sh1pt/core';

interface Config {
  appId: string;             // Partner Center app identity (e.g. Acme.MyApp)
  publisherId: string;       // e.g. "CN=12345678-90ab-cdef-..."
  // 'msstore' = Microsoft Store (MSIX), 'msi' = direct MSI distribution, 'both'
  distribution: 'msstore' | 'msi' | 'both';
  signingCertThumbprint?: string;
  architectures?: ('x64' | 'arm64' | 'x86')[];
}

export default defineTarget<Config>({
  id: 'desktop-win',
  kind: 'desktop',
  label: 'Windows (Microsoft Store / MSIX / MSI)',
  async build(ctx, config) {
    const arches = config.architectures ?? ['x64', 'arm64'];
    ctx.log(`build ${config.distribution} · arches=${arches.join(',')}`);
    // TODO:
    //  - MSIX: makeappx pack + signtool sign using signingCertThumbprint
    //  - MSI: WiX toolset → .msi → signtool sign
    // Requires Windows runner; cloud builds route to a windows worker.
    const ext = config.distribution === 'msi' ? 'msi' : 'msixbundle';
    return { artifact: `${ctx.outDir}/app.${ext}` };
  },
  async ship(ctx, config) {
    ctx.log(`publish ${config.appId}@${ctx.version} · distribution=${config.distribution}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - msstore: Partner Center submission API (create submission → upload → commit)
    //  - msi: upload to configured CDN/GitHub release + update winget manifest via pkg-winget
    return {
      id: `${config.appId}@${ctx.version}`,
      url: config.distribution !== 'msi' ? `https://apps.microsoft.com/detail/${config.appId}` : undefined,
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },
});
