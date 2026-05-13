import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Shortcut {
  target: string;
  name: string;
  arguments?: string;
}

interface Config {
  appName: string;          // e.g. "myapp"
  bucketRepo?: string;      // GitHub repo for your scoop bucket, e.g. "myorg/scoop-bucket"
  urlTemplate?: string;     // download URL template with {{version}}
  url?: string;             // explicit download URL, wins over urlTemplate
  hash?: string;            // sha256, or "sha256:<value>"
  bin?: string | string[];  // executable(s) exposed by Scoop
  homepage?: string;
  license?: string;
  description?: string;
  architecture?: Record<string, { url: string; hash: string }>;
  shortcuts?: Shortcut[];
  notes?: string;
  envAddPath?: string | string[];
}

export default defineTarget<Config>({
  id: 'pkg-scoop',
  kind: 'package-manager',
  label: 'Scoop bucket',
  async build(ctx, config) {
    const manifestPath = join(ctx.outDir, `${config.appName}.json`);
    ctx.log(`generate scoop manifest ${config.appName}.json for v${ctx.version}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(manifestPath, JSON.stringify(createManifest(ctx.version, config), null, 2) + '\n');
    return { artifact: manifestPath };
  },
  async ship(ctx, config) {
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

function createManifest(version: string, config: Config): Record<string, unknown> {
  const url = resolveUrl(version, config);
  const manifest: Record<string, unknown> = {
    version,
    description: config.description ?? `${config.appName} packaged by sh1pt`,
    homepage: config.homepage,
    license: config.license,
    notes: config.notes,
    url,
    hash: normalizeHash(config.hash),
    bin: config.bin ?? config.appName,
    shortcuts: config.shortcuts?.map((shortcut) => [
      shortcut.target,
      shortcut.name,
      ...(shortcut.arguments ? [shortcut.arguments] : []),
    ]),
    env_add_path: config.envAddPath,
    architecture: normalizeArchitecture(config.architecture),
  };

  return Object.fromEntries(Object.entries(manifest).filter(([, value]) => value !== undefined));
}

function resolveUrl(version: string, config: Config): string {
  const url = config.url ?? config.urlTemplate?.replaceAll('{{version}}', version);
  if (!url) throw new Error('pkg-scoop requires config.url or config.urlTemplate');
  return url;
}

function normalizeHash(hash: string | undefined): string | undefined {
  if (!hash) return undefined;
  return hash.startsWith('sha256:') ? hash.slice('sha256:'.length) : hash;
}

function normalizeArchitecture(
  architecture: Config['architecture'],
): Record<string, { url: string; hash: string }> | undefined {
  if (!architecture) return undefined;
  return Object.fromEntries(Object.entries(architecture).map(([key, value]) => [
    key,
    { url: value.url, hash: normalizeHash(value.hash) ?? value.hash },
  ]));
}
