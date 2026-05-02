import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageId: string;       // e.g. "MyCompany.MyApp"
  publisher?: string;
  installerType?: 'exe' | 'msi' | 'msix' | 'zip' | 'portable';
}

export default defineTarget<Config>({
  id: 'pkg-winget',
  kind: 'package-manager',
  label: 'Microsoft winget',
  async build(ctx, config) {
    ctx.log(`generate winget manifest for ${config.packageId} v${ctx.version}`);
    // TODO: render YAML manifests (version, installer, locale) from template
    return { artifact: `${ctx.outDir}/manifests/${config.packageId}` };
  },
  async ship(ctx, config) {
    ctx.log(`submit winget PR for ${config.packageId}@${ctx.version}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: fork winget-pkgs, add manifests, open PR via GitHub API
    // Uses GITHUB_TOKEN from ctx.secret('GITHUB_TOKEN')
    return {
      id: `${config.packageId}@${ctx.version}`,
      url: `https://github.com/microsoft/winget-pkgs/pulls`,
    };
  },
  async status(id) {
    const [pkgId] = id.split('@');
    return { state: 'live', url: `https://winstall.app/apps/${pkgId}` };
  },
  setup: manualSetup({
    label: 'Microsoft winget',
    vendorDocUrl: 'https://learn.microsoft.com/en-us/windows/package-manager/package/repository',
    steps: [
      'Run: sh1pt secret set GITHUB_TOKEN <pat-with-repo-scope>',
      'sh1pt will fork microsoft/winget-pkgs, add manifests, and open a PR automatically',
      'Ensure your installer URL is stable and version-tagged',
    ],
  }),
});
