import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type ScoopArch = '64bit' | '32bit' | 'arm64';
type ScoopShortcuts = [string, string][];

interface ArchitectureConfig {
  name: ScoopArch;
  url?: string;
  sha256?: string;
  bin?: string | string[];
  shortcuts?: ScoopShortcuts;
  extractDir?: string;
}

interface Config {
  appName: string;          // e.g. "myapp"
  bucketRepo?: string;      // GitHub repo for your scoop bucket, e.g. "myorg/scoop-bucket"
  urlTemplate?: string;     // download URL template with {{version}}
  downloadRepo?: string;    // GitHub release repo, e.g. "myorg/myapp"
  sha256?: string;
  description?: string;
  homepage?: string;
  license?: string;
  bin?: string | string[];
  shortcuts?: ScoopShortcuts;
  architecture?: ArchitectureConfig[];
  checkver?: string | Record<string, unknown>;
  autoupdate?: {
    url?: string;
    hash?: { url: string };
  };
}

function scoopVersion(version: string): string {
  return version.replace(/^v/, '');
}

function assertAppName(appName: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(appName)) {
    throw new Error(`appName must be a valid Scoop manifest name, got "${appName}"`);
  }
}

function templateValue(value: string, config: Config, version: string, arch: ScoopArch): string {
  return value
    .replaceAll('{{version}}', version)
    .replaceAll('{version}', version)
    .replaceAll('{{appName}}', config.appName)
    .replaceAll('{appName}', config.appName)
    .replaceAll('{{arch}}', arch)
    .replaceAll('{arch}', arch);
}

function defaultUrlTemplate(config: Config): string {
  const repo = config.downloadRepo ?? config.bucketRepo ?? `profullstack/${config.appName}`;
  return `https://github.com/${repo}/releases/download/v{{version}}/${config.appName}-{{version}}-{{arch}}.zip`;
}

function architectureUrl(ctx: { version: string }, config: Config, arch: ArchitectureConfig): string {
  return templateValue(arch.url ?? config.urlTemplate ?? defaultUrlTemplate(config), config, scoopVersion(ctx.version), arch.name);
}

function renderManifest(ctx: { version: string }, config: Config): string {
  assertAppName(config.appName);
  const version = scoopVersion(ctx.version);
  const architectures = config.architecture ?? [{ name: '64bit' as const }];
  const manifest: Record<string, unknown> = {
    version,
    description: config.description ?? `${config.appName} release`,
    homepage: config.homepage ?? 'https://sh1pt.com',
    license: config.license ?? 'MIT',
    architecture: Object.fromEntries(architectures.map((arch) => {
      const entry: Record<string, unknown> = {
        url: architectureUrl(ctx, config, arch),
        hash: arch.sha256 ?? config.sha256 ?? 'skip',
      };
      if (arch.extractDir) entry.extract_dir = arch.extractDir;
      if (arch.bin ?? config.bin) entry.bin = arch.bin ?? config.bin;
      if (arch.shortcuts ?? config.shortcuts) entry.shortcuts = arch.shortcuts ?? config.shortcuts;
      return [arch.name, entry];
    })),
  };

  if (config.checkver) manifest.checkver = config.checkver;
  if (config.autoupdate) {
    manifest.autoupdate = {
      ...config.autoupdate,
      ...(config.autoupdate.url ? {
        url: templateValue(config.autoupdate.url, config, '$version', '64bit'),
      } : {}),
    };
  }

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export default defineTarget<Config>({
  id: 'pkg-scoop',
  kind: 'package-manager',
  label: 'Scoop bucket',
  async build(ctx, config) {
    assertAppName(config.appName);
    const manifestPath = join(ctx.outDir, `${config.appName}.json`);
    ctx.log(`generate scoop manifest ${config.appName}.json for v${ctx.version}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(manifestPath, renderManifest(ctx, config), 'utf-8');
    return { artifact: manifestPath };
  },
  async ship(ctx, config) {
    assertAppName(config.appName);
    const bucket = config.bucketRepo ?? 'profullstack/scoop-bucket';
    ctx.log(`push ${config.appName}.json to ${bucket} bucket`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: update/create bucket/${appName}.json in the bucket repo via GitHub API
    // Uses GITHUB_TOKEN from ctx.secret('GITHUB_TOKEN')
    return {
      id: `${config.appName}@${ctx.version}`,
      url: `https://github.com/${bucket}`,
    };
  },
  async status(id) {
    const [name] = id.split('@');
    return { state: 'live', url: `https://scoop.sh/#/apps?q=${name}` };
  },
  setup: manualSetup({
    label: 'Scoop bucket',
    vendorDocUrl: 'https://github.com/ScoopInstaller/Scoop/wiki/App-Manifests',
    steps: [
      'Create a public GitHub repo named scoop-bucket',
      'Run: sh1pt secret set GITHUB_TOKEN <pat-with-repo-scope>',
      'Run: sh1pt secret set SCOOP_BUCKET_REPO <owner>/<repo>',
      'sh1pt will push updated manifests to your bucket on each release',
    ],
  }),
});
