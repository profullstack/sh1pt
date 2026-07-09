import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  extensionId: string;
  sourceDir?: string;
  deployPercent?: number;
}

function requireText(value: string | undefined, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`browser-chrome requires ${name}`);
  }
  return value.trim();
}

function optionalText(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  return requireText(value, name);
}

function requireExtensionId(value: string | undefined): string {
  const extensionId = requireText(value, 'extensionId');
  if (/[\\/?#\x00-\x1F\x7F]/.test(extensionId)) {
    throw new Error('browser-chrome extensionId must be a single URL path segment');
  }
  return extensionId;
}

function sourceDir(ctx: { projectDir: string }, config: Config): string {
  const dir = optionalText(config.sourceDir, 'sourceDir') ?? 'dist';
  return isAbsolute(dir) ? dir : join(ctx.projectDir, dir);
}

function safeFileStem(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-+|-+$/g, '') || 'chrome-extension';
}

function packageArtifact(ctx: { outDir: string; version: string }, config: Config): string {
  return join(ctx.outDir, `${safeFileStem(requireExtensionId(config.extensionId))}-${safeFileStem(ctx.version)}.zip`);
}

function packagePlan(ctx: { projectDir: string; outDir: string; version: string }, config: Config) {
  const extensionId = requireExtensionId(config.extensionId);
  const src = sourceDir(ctx, config);
  const artifact = packageArtifact(ctx, config);
  return {
    provider: 'chrome-web-store',
    extensionId,
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
    const extensionId = requireExtensionId(config.extensionId);
    const src = sourceDir(ctx, config);
    const zipPath = packageArtifact(ctx, config);

    ctx.log(`pack Chrome extension ${extensionId} from ${src} for v${ctx.version}`);

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
    const extensionId = requireExtensionId(config.extensionId);
    ctx.log(`upload + publish extension ${extensionId}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Chrome Web Store Publish API w/ refresh token
    return {
      id: `${extensionId}@${ctx.version}`,
      url: `https://chrome.google.com/webstore/detail/${extensionId}`,
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
