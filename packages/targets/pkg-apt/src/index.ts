import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageName: string;      // e.g. "myapp"
  architecture?: ('amd64' | 'arm64' | 'armhf')[];
  distribution?: string;    // e.g. "jammy" | "noble"
  component?: string;       // e.g. "main"
  repoHost?: string;        // e.g. "apt.example.com"
}

export default defineTarget<Config>({
  id: 'pkg-apt',
  kind: 'package-manager',
  label: 'apt repo / PPA',
  async build(ctx, config) {
    const arches = config.architecture ?? ['amd64', 'arm64'];
    ctx.log(`build .deb for ${config.packageName} v${ctx.version} [${arches.join(', ')}]`);
    // TODO: run dpkg-buildpackage or fpm to produce .deb artifacts
    return { artifact: `${ctx.outDir}/${config.packageName}_${ctx.version}_amd64.deb` };
  },
  async ship(ctx, config) {
    const dist = config.distribution ?? 'jammy';
    const component = config.component ?? 'main';
    ctx.log(`publish ${config.packageName}@${ctx.version} to apt repo (${dist}/${component})`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: upload .deb and update InRelease/Packages with GPG signing
    // Uses APT_GPG_KEY + APT_REPO_SSH_KEY from ctx.secret()
    return {
      id: `${config.packageName}@${ctx.version}`,
      url: `https://${config.repoHost ?? 'apt.sh1pt.com'}`,
    };
  },
  async status(id) {
    const name = id.split('@')[0] ?? id;
    return { state: 'live', url: `https://apt.sh1pt.com/pool/main/${name[0] ?? '_'}/${name}/` };
  },
  setup: manualSetup({
    label: 'apt repo / PPA',
    vendorDocUrl: 'https://wiki.debian.org/HowToSetupADebianRepository',
    steps: [
      'Generate a GPG key for signing: gpg --full-generate-key',
      'Run: sh1pt secret set APT_GPG_KEY "$(gpg --export-secret-keys --armor <key-id>)"',
      'Run: sh1pt secret set APT_GPG_PASSPHRASE <passphrase>',
      'Configure your apt repo host (S3 + CloudFront or self-hosted)',
      'Run: sh1pt secret set APT_REPO_SSH_KEY "$(cat ~/.ssh/apt_deploy_key)"',
    ],
  }),
});
