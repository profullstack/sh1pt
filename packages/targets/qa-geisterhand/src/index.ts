import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';

// Geisterhand is an open-source UI automation harness (Swift/macOS, .NET/Windows,
// Rust/Linux) that lets a Claude agent drive a built app via accessibility APIs.
// We treat it as a pre-publish QA target: build → boot the app under
// `geisterhand run`, drive a scripted test plan, capture screenshots, fail the
// pipeline if assertions don't hold.
// https://geisterhand.io/
interface Config {
  app: string;
  plan?: string;
  screenshotsDir?: string;
  serverPort?: number;
}

export default defineTarget<Config>({
  id: 'qa-geisterhand',
  kind: 'plugin',
  label: 'Geisterhand (UI test/automation harness)',
  async build(ctx, config) {
    ctx.log(`geisterhand prepare ${config.app}`);
    return { artifact: config.app };
  },
  async ship(ctx, config) {
    const plan = config.plan ?? 'geisterhand.plan.json';
    const screenshotsDir = config.screenshotsDir ?? `${ctx.outDir}/screenshots`;
    ctx.log(`geisterhand run ${config.app} --plan=${plan}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const args = ['run', config.app, `--plan=${plan}`, `--screenshots=${screenshotsDir}`];
    if (config.serverPort) args.push(`--port=${config.serverPort}`);

    await exec('geisterhand', args, {
      cwd: ctx.projectDir,
      log: ctx.log,
      throwOnNonZero: true,
    });

    return { id: `geisterhand:${ctx.version}`, meta: { screenshotsDir } };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: 'Geisterhand',
    vendorDocUrl: 'https://geisterhand.io/',
    steps: [
      'Install Geisterhand: brew install geisterhand (macOS), cargo install geisterhand (Linux), or grab the Windows build from geisterhand.io',
      'Grant Accessibility + Screen Recording permissions to the Geisterhand app',
      'Author a plan file (e.g. geisterhand.plan.json) describing the test steps',
    ],
  }),
});
