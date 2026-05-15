import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  appId: string;             // Partner Center app identity (e.g. Acme.MyApp)
  publisherId: string;       // e.g. "CN=12345678-90ab-cdef-..."
  // 'msstore' = Microsoft Store (MSIX), 'msi' = direct MSI distribution, 'both'
  distribution: 'msstore' | 'msi' | 'both';
  signingCertThumbprint?: string;
  architectures?: ('x64' | 'arm64' | 'x86')[];
}

type ArtifactKind = 'msixbundle' | 'msi';

function architecturesFor(config: Config): Array<'x64' | 'arm64' | 'x86'> {
  return config.architectures ?? ['x64', 'arm64'];
}

function artifactKinds(distribution: Config['distribution']): ArtifactKind[] {
  if (distribution === 'both') return ['msixbundle', 'msi'];
  return distribution === 'msi' ? ['msi'] : ['msixbundle'];
}

function artifactPath(ctx: { outDir: string }, kind: ArtifactKind): string {
  return join(ctx.outDir, kind === 'msi' ? 'app.msi' : 'app.msixbundle');
}

function packageCommands(ctx: { outDir: string }, config: Config): string[][] {
  const commands: string[][] = [];
  const sourceDir = join(ctx.outDir, 'windows-unpacked');
  if (config.distribution !== 'msi') {
    commands.push(['makeappx', 'pack', '/d', sourceDir, '/p', artifactPath(ctx, 'msixbundle')]);
  }
  if (config.distribution !== 'msstore') {
    commands.push(['wix', 'build', join(sourceDir, 'Product.wxs'), '-out', artifactPath(ctx, 'msi')]);
  }
  if (config.signingCertThumbprint) {
    for (const kind of artifactKinds(config.distribution)) {
      commands.push(['signtool', 'sign', '/sha1', config.signingCertThumbprint, '/fd', 'SHA256', artifactPath(ctx, kind)]);
    }
  }
  return commands;
}

function renderPlan(ctx: { outDir: string; version: string }, config: Config): string {
  const artifacts = artifactKinds(config.distribution).map((kind) => ({
    kind,
    path: artifactPath(ctx, kind),
  }));
  return `${JSON.stringify({
    provider: 'windows-desktop',
    appId: config.appId,
    publisherId: config.publisherId,
    version: ctx.version,
    distribution: config.distribution,
    architectures: architecturesFor(config),
    artifacts,
    commands: packageCommands(ctx, config),
    followUp: config.signingCertThumbprint
      ? []
      : ['signingCertThumbprint is required before signing Windows artifacts'],
  }, null, 2)}\n`;
}

export default defineTarget<Config>({
  id: 'desktop-win',
  kind: 'desktop',
  label: 'Windows (Microsoft Store / MSIX / MSI)',
  async build(ctx, config) {
    const arches = architecturesFor(config);
    ctx.log(`build ${config.distribution} · arches=${arches.join(',')}`);
    if (ctx.dryRun) {
      const planPath = join(ctx.outDir, 'windows-package-plan.json');
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
      return { artifact: planPath };
    }
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

  setup: manualSetup({
    label: "Microsoft Store (Windows)",
    vendorDocUrl: "https://partner.microsoft.com/dashboard",
    steps: [
      "Register at partner.microsoft.com ($19 individual / $99 company)",
      "Complete identity verification (1-3 days)",
      "Create an Azure AD app \u2192 generate client_secret",
      "Run: sh1pt secret set MS_STORE_TENANT_ID <uuid>",
      "Run: sh1pt secret set MS_STORE_CLIENT_ID <uuid>",
      "Run: sh1pt secret set MS_STORE_CLIENT_SECRET <secret>",
    ],
  }),
});
