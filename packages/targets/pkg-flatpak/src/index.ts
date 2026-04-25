import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  appId: string;             // Reverse-DNS app ID, e.g. "com.example.MyApp"
  branch?: 'stable' | 'beta';
  runtime?: string;          // e.g. "org.freedesktop.Platform"
  runtimeVersion?: string;   // e.g. "23.08"
  sdkExtensions?: string[];  // e.g. ["org.freedesktop.Sdk.Extension.node20"]
  flathubRepo?: string;      // defaults to "https://github.com/flathub/flathub"
}

export default defineTarget<Config>({
  id: 'pkg-flatpak',
  kind: 'package-manager',
  label: 'Flathub',
  async build(ctx, config) {
    const branch = config.branch ?? (ctx.channel === 'stable' ? 'stable' : 'beta');
    const runtime = config.runtime ?? 'org.freedesktop.Platform';
    const runtimeVersion = config.runtimeVersion ?? '23.08';
    ctx.log(`render ${config.appId}.yml manifest for v${ctx.version} (branch: ${branch})`);
    ctx.log(`runtime: ${runtime}//${runtimeVersion}`);
    // TODO: render Flatpak manifest YAML from template:
    //   app-id: ${appId}  runtime: ${runtime}  runtime-version: ${runtimeVersion}
    //   sdk-extensions: ${sdkExtensions}
    //   modules: [{ name: <appName>, sources: [{ type: archive, url: ..., sha256: ... }] }]
    // TODO: run `flatpak-builder --repo=repo --force-clean builddir ${appId}.yml`
    return { artifact: `${ctx.outDir}/${config.appId}.flatpak` };
  },
  async ship(ctx, config) {
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
