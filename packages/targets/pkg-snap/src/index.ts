import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  snapName: string;          // e.g. "myapp"
  grade?: 'stable' | 'devel';
  confinement?: 'strict' | 'classic' | 'devmode';
  base?: 'core22' | 'core24' | 'bare';
  architectures?: ('amd64' | 'arm64' | 'armhf' | 'i386' | 'riscv64' | 's390x')[];
  channel?: 'stable' | 'candidate' | 'beta' | 'edge';
}

export default defineTarget<Config>({
  id: 'pkg-snap',
  kind: 'package-manager',
  label: 'Snapcraft',
  async build(ctx, config) {
    const grade = config.grade ?? (ctx.channel === 'stable' ? 'stable' : 'devel');
    const confinement = config.confinement ?? 'strict';
    const base = config.base ?? 'core22';
    const arches = config.architectures ?? ['amd64', 'arm64'];
    ctx.log(`render snapcraft.yaml for ${config.snapName} v${ctx.version} (${grade}/${confinement})`);
    ctx.log(`architectures: ${arches.join(', ')} | base: ${base}`);
    // TODO: render snapcraft.yaml from template using ctx.projectDir metadata
    // TODO: run `snapcraft --destructive-mode` or `snapcraft remote-build`
    return { artifact: `${ctx.outDir}/${config.snapName}_${ctx.version}_multi.snap` };
  },
  async ship(ctx, config) {
    const trackChannel = config.channel ?? (ctx.channel === 'stable' ? 'stable' : 'edge');
    ctx.log(`snapcraft upload + release ${config.snapName} → ${trackChannel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: snapcraft upload --release=${trackChannel} <snap-file>
    // Uses SNAPCRAFT_STORE_CREDENTIALS from ctx.secret('SNAPCRAFT_STORE_CREDENTIALS')
    return {
      id: `${config.snapName}@${ctx.version}`,
      url: `https://snapcraft.io/${config.snapName}`,
    };
  },
  async status(id) {
    const [name] = id.split('@');
    return { state: 'live', url: `https://snapcraft.io/${name}` };
  },

  setup: manualSetup({
    label: 'Snapcraft Store',
    vendorDocUrl: 'https://snapcraft.io/docs/snapcraft-authentication',
    steps: [
      'Install snapcraft: sudo snap install snapcraft --classic',
      'Log in and export credentials: snapcraft export-login --snaps <name> --acls package_access,package_push,package_release credentials.txt',
      'Run: sh1pt secret set SNAPCRAFT_STORE_CREDENTIALS "$(cat credentials.txt)"',
      'Ensure your project has a snap/snapcraft.yaml (sh1pt can scaffold one)',
    ],
  }),
});
