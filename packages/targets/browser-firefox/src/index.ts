import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  extensionId: string;       // AMO extension id, e.g. "{some-uuid}" or "myext@example.com"
  sourceDir?: string;        // defaults to "dist/" or "web-ext-artifacts/"
  channel?: 'listed' | 'unlisted';
}

function sourceDir(ctx: { projectDir: string }, config: Config): string {
  const src = config.sourceDir ?? 'dist/';
  return isAbsolute(src) ? src : join(ctx.projectDir, src);
}

function channelFor(config: Config): 'listed' | 'unlisted' {
  return config.channel ?? 'listed';
}

function safeExtensionId(extensionId: string): string {
  return extensionId.replace(/[{}@]/g, '_');
}

function expectedArtifact(ctx: { outDir: string; version: string }, config: Config): string {
  return join(ctx.outDir, `${safeExtensionId(config.extensionId)}-${ctx.version}.zip`);
}

function buildArgs(ctx: { outDir: string; projectDir: string }, config: Config): string[] {
  return ['build', '--source-dir', sourceDir(ctx, config), '--artifacts-dir', ctx.outDir];
}

function renderPlan(ctx: { channel: string; outDir: string; projectDir: string; version: string }, config: Config): string {
  return `${JSON.stringify({
    provider: 'firefox-amo',
    extensionId: config.extensionId,
    version: ctx.version,
    sourceDir: sourceDir(ctx, config),
    channel: channelFor(config),
    expectedArtifact: expectedArtifact(ctx, config),
    command: ['web-ext', ...buildArgs(ctx, config)],
  }, null, 2)}\n`;
}

export default defineTarget<Config>({
  id: 'browser-firefox',
  kind: 'browser-ext',
  label: 'Firefox Add-ons (AMO)',
  async build(ctx, config) {
    const src = sourceDir(ctx, config);
    const planPath = join(ctx.outDir, 'firefox-package-plan.json');
    ctx.log(`pack Firefox extension from ${src} using web-ext build`);
    if (ctx.dryRun) {
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
      return { artifact: planPath };
    }
    // TODO: run `web-ext build --source-dir ${src} --artifacts-dir ${ctx.outDir}`
    // Validates manifest.json (v2 or v3) and zips into ctx.outDir
    return { artifact: expectedArtifact(ctx, config), meta: { command: ['web-ext', ...buildArgs(ctx, config)] } };
  },
  async ship(ctx, config) {
    const channel = channelFor(config);
    ctx.log(`sign + submit ${config.extensionId} to AMO (channel: ${channel})`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { channel, sourceDir: sourceDir(ctx, config) } };
    // TODO: web-ext sign --api-key=${AMO_JWT_ISSUER} --api-secret=${AMO_JWT_SECRET}
    //       --channel=${channel} --source-dir ${config.sourceDir ?? 'dist/'}
    // Or: POST https://addons.mozilla.org/api/v5/addons/<id>/versions/ with JWT auth
    return {
      id: `${config.extensionId}@${ctx.version}`,
      url: `https://addons.mozilla.org/en-US/firefox/addon/${config.extensionId}/`,
    };
  },
  async status(id) {
    const [extId] = id.split('@');
    return { state: 'live', url: `https://addons.mozilla.org/en-US/firefox/addon/${extId}/` };
  },

  setup: manualSetup({
    label: 'Firefox Add-ons (AMO)',
    vendorDocUrl: 'https://addons.mozilla.org/en-US/developers/addon/api/key/',
    steps: [
      'Go to https://addons.mozilla.org/en-US/developers/addon/api/key/ and generate API credentials',
      'Run: sh1pt secret set AMO_JWT_ISSUER <jwt-issuer>',
      'Run: sh1pt secret set AMO_JWT_SECRET <jwt-secret>',
      'Ensure your extension has a valid manifest.json (v2 or v3)',
      'sh1pt uses web-ext to build, sign, and publish automatically',
    ],
  }),
});
