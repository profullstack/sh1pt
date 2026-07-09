import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  extensionId: string;       // AMO extension id, e.g. "{some-uuid}" or "myext@example.com"
  sourceDir?: string;        // defaults to "dist/" or "web-ext-artifacts/"
  channel?: 'listed' | 'unlisted';
}

interface FirefoxPackagePlan {
  provider: 'mozilla-addons';
  extensionId: string;
  version: string;
  sourceDir: string;
  artifact: string;
  channel: 'listed' | 'unlisted';
  build: {
    command: 'web-ext';
    args: string[];
    cwd: string;
  };
}

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`browser-firefox requires ${field}`);
  return trimmed;
}

function extensionId(value: string | undefined): string {
  const id = requireValue(value, 'extensionId');
  if (/\s/.test(id)) throw new Error('browser-firefox extensionId must not contain whitespace');
  return id;
}

function configuredSourceDir(value: string | undefined): string {
  return value === undefined ? 'dist' : requireValue(value, 'sourceDir');
}

function channel(value: string | undefined): 'listed' | 'unlisted' {
  if (value === undefined) return 'listed';
  if (value !== 'listed' && value !== 'unlisted') {
    throw new Error('browser-firefox channel must be listed or unlisted');
  }
  return value;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    extensionId: extensionId(config.extensionId),
    sourceDir: configuredSourceDir(config.sourceDir),
    channel: channel(config.channel),
  };
}

function sourceDir(ctx: { projectDir: string }, config: Config): string {
  const dir = configuredSourceDir(config.sourceDir);
  return isAbsolute(dir) ? dir : join(ctx.projectDir, dir);
}

function safeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'firefox-extension';
}

function artifactName(ctx: { version: string }, config: Config): string {
  return `${safeFileStem(config.extensionId)}-${safeFileStem(ctx.version)}.zip`;
}

function artifactPath(ctx: { outDir: string; version: string }, config: Config): string {
  return join(ctx.outDir, artifactName(ctx, config));
}

function packagePlan(
  ctx: { projectDir: string; outDir: string; version: string },
  config: Config,
): FirefoxPackagePlan {
  config = normalizedConfig(config);
  const src = sourceDir(ctx, config);
  const filename = artifactName(ctx, config);
  return {
    provider: 'mozilla-addons',
    extensionId: config.extensionId,
    version: ctx.version,
    sourceDir: src,
    artifact: join(ctx.outDir, filename),
    channel: config.channel ?? 'listed',
    build: {
      command: 'web-ext',
      args: ['build', '--source-dir', src, '--artifacts-dir', ctx.outDir, '--filename', filename],
      cwd: ctx.projectDir,
    },
  };
}

function parseSubmittedId(id: string): string {
  const marker = id.lastIndexOf('@');
  return marker <= 0 ? id : id.slice(0, marker);
}

export default defineTarget<Config>({
  id: 'browser-firefox',
  kind: 'browser-ext',
  label: 'Firefox Add-ons (AMO)',
  async build(ctx, config) {
    const plan = packagePlan(ctx, config);
    ctx.log(`pack Firefox extension from ${plan.sourceDir} using web-ext build`);
    await mkdir(ctx.outDir, { recursive: true });

    if (ctx.dryRun) {
      const planPath = join(ctx.outDir, `${safeFileStem(config.extensionId)}-${safeFileStem(ctx.version)}.firefox-plan.json`);
      await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
      return { artifact: planPath, meta: { artifact: plan.artifact, command: plan.build } };
    }

    const manifestPath = join(plan.sourceDir, 'manifest.json');
    let manifestText: string;
    try {
      manifestText = await readFile(manifestPath, 'utf-8');
    } catch {
      throw new Error(`manifest.json not found at ${manifestPath} — run a build step first`);
    }
    const manifest = JSON.parse(manifestText) as { manifest_version?: number };
    if (manifest.manifest_version !== 2 && manifest.manifest_version !== 3) {
      ctx.log(`manifest_version is ${manifest.manifest_version ?? 'missing'}, Firefox expects v2 or v3`, 'warn');
    }

    await exec(plan.build.command, plan.build.args, {
      cwd: plan.build.cwd,
      log: ctx.log,
      throwOnNonZero: true,
    });

    return { artifact: artifactPath(ctx, config) };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
    ctx.log(`sign + submit ${config.extensionId} to AMO (channel: ${config.channel})`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { extensionId: config.extensionId, channel: config.channel } };
    // TODO: web-ext sign --api-key=${AMO_JWT_ISSUER} --api-secret=${AMO_JWT_SECRET}
    //       --channel=${config.channel} --source-dir ${config.sourceDir}
    // Or: POST https://addons.mozilla.org/api/v5/addons/<id>/versions/ with JWT auth
    return {
      id: `${config.extensionId}@${ctx.version}`,
      url: `https://addons.mozilla.org/en-US/firefox/addon/${config.extensionId}/`,
    };
  },
  async status(id) {
    const extId = parseSubmittedId(id);
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
