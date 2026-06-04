import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  extensionId: string;
  sourceDir?: string;
  deployPercent?: number;
}

function sourceDir(ctx: { projectDir: string }, config: Config): string {
  const dir = config.sourceDir ?? 'dist';
  return isAbsolute(dir) ? dir : join(ctx.projectDir, dir);
}

function safeFileStem(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-+|-+$/g, '') || 'chrome-extension';
}

function packageArtifact(ctx: { outDir: string; version: string }, config: Config): string {
  return join(ctx.outDir, `${safeFileStem(config.extensionId)}-${safeFileStem(ctx.version)}.zip`);
}

function packagePlan(ctx: { projectDir: string; outDir: string; version: string }, config: Config) {
  const src = sourceDir(ctx, config);
  const artifact = packageArtifact(ctx, config);
  return {
    provider: 'chrome-web-store',
    extensionId: config.extensionId,
    version: ctx.version,
    sourceDir: src,
    artifact,
    command: ['zip', '-r', artifact, '.'],
    cwd: src,
  };
}

export default defineTarget<Config>({
  id: 'browser-chrome',
  kind: 'browser-ext',
  label: 'Chrome Web Store',
  async build(ctx, config) {
    const src = sourceDir(ctx, config);
    const zipPath = packageArtifact(ctx, config);

    ctx.log(`pack Chrome extension from ${src} for v${ctx.version}`);

    if (ctx.dryRun) {
      const planPath = join(ctx.outDir, 'chrome-package.json');
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, `${JSON.stringify(packagePlan(ctx, config), null, 2)}\n`, 'utf-8');
      return { artifact: planPath };
    }

    const manifestPath = join(src, 'manifest.json');
    let manifestText: string;
    try {
      manifestText = await readFile(manifestPath, 'utf-8');
    } catch {
      throw new Error(`manifest.json not found at ${manifestPath} - run a build step first`);
    }
    const manifest = JSON.parse(manifestText) as { manifest_version?: number };
    if (manifest.manifest_version !== 3) {
      ctx.log(`manifest_version is ${manifest.manifest_version ?? 'missing'}, Chrome expects v3`, 'warn');
    }

    await mkdir(ctx.outDir, { recursive: true });
    await exec('zip', ['-r', zipPath, '.'], {
      cwd: src,
      log: ctx.log,
      throwOnNonZero: true,
    });

    ctx.log(`created ${zipPath}`);
    return { artifact: zipPath };
  },
  async ship(ctx, config) {
    ctx.log(`upload + publish extension ${config.extensionId}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Chrome Web Store Publish API w/ refresh token
    return {
      id: `${config.extensionId}@${ctx.version}`,
      url: `https://chrome.google.com/webstore/detail/${config.extensionId}`,
    };
  },

  setup: manualSetup({
    label: "Chrome Web Store",
    vendorDocUrl: "https://chrome.google.com/webstore/devconsole",
    steps: [
      "Register at chrome.google.com/webstore/devconsole ($5 one-time fee)",
      "Complete identity verification (can take 2-3 days)",
      "Generate OAuth credentials at console.cloud.google.com \u2192 enable Chrome Web Store API",
      "Run: sh1pt secret set CHROME_STORE_REFRESH_TOKEN <token>",
    ],
  }),
});
