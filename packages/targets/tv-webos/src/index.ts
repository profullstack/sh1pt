import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// webOS apps are HTML/CSS/JS — a great fit for React codebases via Enact
// (LG's React-based framework) or vanilla web. Packaged as .ipk using
// LG's `ares` CLI, distributed through the LG Content Store.
interface Config {
  appId: string;                                      // e.g. com.acme.myapp
  sourceDir: string;                                  // built web app
  submission: 'lg-content-store' | 'developer-mode';  // dev-mode = sideload
  developerId?: string;                               // LG Seller Lounge id
  deviceName?: string;                                // ares device name for developer-mode sideloads
}

interface WebOsAppInfo {
  id?: string;
  version?: string;
  title?: string;
  vendor?: string;
  main?: string;
  icon?: string;
  type?: string;
}

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`tv-webos requires ${field}`);
  return trimmed;
}

async function readAppInfo(sourceDir: string, appId: string): Promise<WebOsAppInfo> {
  const appInfoPath = join(sourceDir, 'appinfo.json');
  const appInfo = JSON.parse(await readFile(appInfoPath, 'utf-8')) as WebOsAppInfo;
  if (appInfo.id !== appId) {
    throw new Error(`webOS appinfo.json id must match appId (${appId})`);
  }
  requireValue(appInfo.version, 'appinfo.version');
  requireValue(appInfo.title, 'appinfo.title');
  requireValue(appInfo.main, 'appinfo.main');
  await access(join(sourceDir, appInfo.main!));
  if (appInfo.icon) await access(join(sourceDir, appInfo.icon));
  return appInfo;
}

async function packagePlan(ctx: { projectDir: string; outDir: string; version: string }, config: Config) {
  const appId = requireValue(config.appId, 'appId');
  const sourceDir = resolve(ctx.projectDir, requireValue(config.sourceDir, 'sourceDir'));
  const info = await stat(sourceDir);
  if (!info.isDirectory()) throw new Error(`tv-webos sourceDir is not a directory: ${sourceDir}`);
  const appInfo = await readAppInfo(sourceDir, appId);
  const packageName = `${appId}_${appInfo.version ?? ctx.version}.ipk`;
  const expectedPackage = join(ctx.outDir, packageName);

  return {
    provider: 'webos',
    appId,
    title: appInfo.title,
    version: appInfo.version,
    sourceDir,
    submission: config.submission,
    developerId: config.developerId,
    deviceName: config.deviceName,
    expectedPackage,
    command: ['ares-package', '-o', ctx.outDir, sourceDir],
    installCommand: config.submission === 'developer-mode'
      ? ['ares-install', '--device', config.deviceName ?? 'default', expectedPackage]
      : undefined,
  };
}

export default defineTarget<Config>({
  id: 'tv-webos',
  kind: 'tv',
  label: 'LG Content Store (webOS)',
  async build(ctx, config) {
    const plan = await packagePlan(ctx, config);
    await mkdir(ctx.outDir, { recursive: true });
    const artifact = join(ctx.outDir, 'webos-package-plan.json');
    await writeFile(artifact, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
    ctx.log(`validated webOS appinfo.json for ${plan.appId}@${plan.version}`);
    return { artifact, meta: { expectedPackage: plan.expectedPackage, command: plan.command } };
  },
  async ship(ctx, config) {
    const dest = config.submission === 'developer-mode' ? 'devkit sideload' : 'LG Content Store review';
    ctx.log(`webOS package ready for ${dest}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { submission: config.submission } };
    return {
      id: `${config.appId}@${ctx.version}`,
      meta: {
        artifact: ctx.artifact,
        submission: config.submission,
        developerId: config.developerId,
        deviceName: config.deviceName,
      },
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "LG webOS",
    vendorDocUrl: "https://webostv.developer.lge.com/",
    steps: [
      "Register at webostv.developer.lge.com \u2192 accept developer agreement",
      "Apps submitted via LG Content Manager (web UI); no public API for submissions",
      "Sign packages with webOS CLI; token only required for publish step",
    ],
  }),
});
