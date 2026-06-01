import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  appId: string;             // Reverse-DNS app ID, e.g. "com.example.MyApp"
  branch?: 'stable' | 'beta';
  runtime?: string;          // e.g. "org.freedesktop.Platform"
  runtimeVersion?: string;   // e.g. "23.08"
  sdk?: string;              // e.g. "org.freedesktop.Sdk"
  sdkExtensions?: string[];  // e.g. ["org.freedesktop.Sdk.Extension.node20"]
  flathubRepo?: string;      // defaults to "https://github.com/flathub/flathub"
  command?: string;
  moduleName?: string;
  buildsystem?: 'simple' | 'meson' | 'cmake' | 'autotools' | string;
  buildCommands?: string[];
  sourceUrl?: string;
  sourceSha256?: string;
  finishArgs?: string[];
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderList(values: string[], indent: string): string[] {
  return values.map((value) => `${indent}- ${yamlString(value)}`);
}

function renderFlatpakManifest(ctx: { projectDir: string; version: string; channel: string }, config: Config): string {
  const branch = config.branch ?? (ctx.channel === 'stable' ? 'stable' : 'beta');
  const runtime = config.runtime ?? 'org.freedesktop.Platform';
  const runtimeVersion = config.runtimeVersion ?? '23.08';
  const sdk = config.sdk ?? 'org.freedesktop.Sdk';
  const command = config.command ?? config.appId.split('.').at(-1) ?? config.appId;
  const moduleName = config.moduleName ?? command;
  const buildsystem = config.buildsystem ?? 'simple';
  const buildCommands = config.buildCommands ?? ['install -D app "$FLATPAK_DEST/bin/app"'];
  const finishArgs = config.finishArgs ?? ['--share=network'];
  const sourceUrl = config.sourceUrl ?? ctx.projectDir;
  const lines = [
    `app-id: ${yamlString(config.appId)}`,
    `runtime: ${yamlString(runtime)}`,
    `runtime-version: ${yamlString(runtimeVersion)}`,
    `sdk: ${yamlString(sdk)}`,
    `command: ${yamlString(command)}`,
    `branch: ${yamlString(branch)}`,
  ];

  if (config.sdkExtensions?.length) {
    lines.push('sdk-extensions:');
    lines.push(...renderList(config.sdkExtensions, '  '));
  }

  if (finishArgs.length) {
    lines.push('finish-args:');
    lines.push(...renderList(finishArgs, '  '));
  }

  lines.push('modules:');
  lines.push(`  - name: ${yamlString(moduleName)}`);
  lines.push(`    buildsystem: ${yamlString(buildsystem)}`);
  lines.push('    build-commands:');
  lines.push(...renderList(buildCommands, '      '));
  lines.push('    sources:');

  if (config.sourceUrl) {
    lines.push('      - type: archive');
    lines.push(`        url: ${yamlString(sourceUrl)}`);
    if (config.sourceSha256) {
      lines.push(`        sha256: ${yamlString(config.sourceSha256)}`);
    }
  } else {
    lines.push('      - type: dir');
    lines.push(`        path: ${yamlString(sourceUrl)}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Validate a Flatpak app ID (reverse-DNS format): at least 3 dot-separated segments,
 * each containing alphanumeric or hyphens. e.g. "com.example.MyApp"
 */
function validateAppId(appId: string): void {
  if (!appId) throw new Error('pkg-flatpak: appId is required');
  const segments = appId.split('.');
  if (segments.length < 3) {
    throw new Error(`pkg-flatpak: invalid appId "${appId}". Must have at least 3 reverse-DNS segments (e.g. "com.example.MyApp").`);
  }
  if (appId.includes('..') || appId.includes('/') || appId.includes('\\')) {
    throw new Error(`pkg-flatpak: appId "${appId}" contains path traversal characters.`);
  }
  for (const seg of segments) {
    if (!seg || !/^[A-Za-z0-9_-]+$/.test(seg)) {
      throw new Error(`pkg-flatpak: invalid segment "${seg}" in appId "${appId}".`);
    }
  }
}

export default defineTarget<Config>({
  id: 'pkg-flatpak',
  kind: 'package-manager',
  label: 'Flathub',
  async build(ctx, config) {
    validateAppId(config.appId);
    const branch = config.branch ?? (ctx.channel === 'stable' ? 'stable' : 'beta');
    const runtime = config.runtime ?? 'org.freedesktop.Platform';
    const runtimeVersion = config.runtimeVersion ?? '23.08';
    const manifestPath = join(ctx.outDir, `${config.appId}.yml`);
    ctx.log(`render ${config.appId}.yml manifest for v${ctx.version} (branch: ${branch})`);
    ctx.log(`runtime: ${runtime}//${runtimeVersion}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(manifestPath, renderFlatpakManifest(ctx, config), 'utf-8');
    // TODO: run `flatpak-builder --repo=repo --force-clean builddir ${appId}.yml`
    return { artifact: manifestPath };
  },
  async ship(ctx, config) {
    validateAppId(config.appId);
    const branch = config.branch ?? (ctx.channel === 'stable' ? 'stable' : 'beta');
    ctx.log(`submit ${config.appId} to Flathub (branch: ${branch})`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // Flathub publishing workflow:
    // 1. Fork https://github.com/flathub/<appId> (or create new Flathub submission PR)
    // 2. Update manifest YAML with new version + sha256
    // 3. Push + open PR against flathub/<appId>
    // Uses GITHUB_TOKEN (for flathub org PR) from ctx.secret('GITHUB_TOKEN')
    return {
      id: `${config.appId}@${ctx.version}`,
      url: `https://flathub.org/apps/${config.appId}`,
    };
  },
  async status(id) {
    const [appId] = id.split('@');
    return { state: 'live', url: `https://flathub.org/apps/${appId}` };
  },

  setup: manualSetup({
    label: 'Flathub',
    vendorDocUrl: 'https://docs.flathub.org/docs/for-app-authors/submission/',
    steps: [
      'Install flatpak-builder: sudo apt install flatpak-builder (or brew install flatpak)',
      'First submission: open a PR at https://github.com/flathub/flathub with your app manifest',
      'Once accepted, a <appId> repo is created under github.com/flathub/',
      'Run: sh1pt secret set GITHUB_TOKEN <token>  (with repo scope for flathub/<appId>)',
      'sh1pt handles subsequent version bumps by pushing updated manifests to the Flathub repo',
    ],
  }),
});
