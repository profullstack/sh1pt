import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  appName: string;          // e.g. "myapp"
  bucketRepo?: string;      // GitHub repo for your scoop bucket, e.g. "myorg/scoop-bucket"
  urlTemplate?: string;     // download URL template with {{version}}
}

export default defineTarget<Config>({
  id: 'pkg-scoop',
  kind: 'package-manager',
  label: 'Scoop bucket',
  async build(ctx, config) {
    ctx.log(`generate scoop manifest ${config.appName}.json for v${ctx.version}`);
    // TODO: render JSON manifest with url, hash, bin, shortcuts
    return { artifact: `${ctx.outDir}/${config.appName}.json` };
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
