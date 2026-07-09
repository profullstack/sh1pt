import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';

// Perry compiles TypeScript to native GUI/CLI binaries (macOS, iOS, iPadOS,
// Android, Linux, Windows, watchOS, tvOS, WebAssembly, Web) and ships them
// via `perry publish` — direct download, App Store, or Play Store.
// https://www.perryts.com/en/
type PerryPlatform =
  | 'macos'
  | 'ios'
  | 'ipados'
  | 'android'
  | 'linux'
  | 'windows'
  | 'watchos'
  | 'tvos'
  | 'wasm'
  | 'web';

type PerryChannel = 'direct' | 'appstore' | 'playstore';

interface Config {
  entry?: string;
  platforms: PerryPlatform[];
  channel: PerryChannel;
  appId?: string;
  release?: 'stable' | 'beta' | 'canary' | string;
}

export default defineTarget<Config>({
  id: 'pkg-perry',
  kind: 'package-manager',
  label: 'Perry (TS → native compile + publish)',
  async build(ctx, config) {
    const entry = config.entry ?? 'src/main.ts';
    const platforms = config.platforms.join(',');
    ctx.log(`perry compile ${entry} --platforms=${platforms} --out=${ctx.outDir}`);
    // TODO: shell out to `perry compile` once the CLI is wired in (see ship()).
    return { artifact: `${ctx.outDir}/perry-${platforms}` };
  },
  async ship(ctx, config) {
    const release = config.release ?? (ctx.channel === 'stable' ? 'stable' : ctx.channel);
    ctx.log(`perry publish · channel=${config.channel} release=${release}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('PERRY_TOKEN');
    if (!token) {
      throw new Error('PERRY_TOKEN secret not set. Run: sh1pt secret set PERRY_TOKEN <token>');
    }

    const args = [
      'publish',
      `--channel=${config.channel}`,
      `--release=${release}`,
      `--artifact=${ctx.outDir}`,
    ];
    if (config.appId) args.push(`--app-id=${config.appId}`);

    await exec('perry', args, {
      cwd: ctx.projectDir,
      log: ctx.log,
      env: { ...ctx.env, PERRY_TOKEN: token },
      throwOnNonZero: true,
    });

    const id = `${config.appId ?? 'app'}@${ctx.version}`;
    return { id, url: `https://www.perryts.com/apps/${config.appId ?? ''}` };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: 'Perry',
    vendorDocUrl: 'https://www.perryts.com/en/',
    steps: [
      'Install the Perry CLI (see perryts.com docs)',
      'Sign in: perry login',
      'Generate a publish token in your Perry account',
      'Run: sh1pt secret set PERRY_TOKEN <token>',
    ],
  }),
});
