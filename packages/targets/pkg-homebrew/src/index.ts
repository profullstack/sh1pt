import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  tap: string;               // e.g. "myorg/homebrew-tap"
  formulaName: string;       // e.g. "sh1pt"
  binaries: { url: string; sha256: string; platform: 'darwin-x64' | 'darwin-arm64' | 'linux-x64' | 'linux-arm64' }[];
}

export default defineTarget<Config>({
  id: 'pkg-homebrew',
  kind: 'package-manager',
  label: 'Homebrew',
  async build(ctx, config) {
    ctx.log(`render Formula/${config.formulaName}.rb`);
    // TODO: render ruby formula from template + ctx.version + config.binaries
    return { artifact: `${ctx.outDir}/${config.formulaName}.rb` };
  },
  async ship(ctx, config) {
    ctx.log(`open PR against ${config.tap} bumping ${config.formulaName} → ${ctx.version}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: git clone tap, commit formula, push branch, open PR via GH_TOKEN
    return { id: `${config.formulaName}@${ctx.version}`, url: `https://github.com/${config.tap}` };
  },

  setup: manualSetup({
    label: "Homebrew",
    vendorDocUrl: "https://github.com/Homebrew/homebrew-core",
    steps: [
      "For personal taps: create a homebrew-<name> repo on GitHub",
      "For core inclusion: submit a formula PR to Homebrew/homebrew-core (manual review)",
      "sh1pt automates the formula generation + tap push; no token needed for personal tap",
    ],
  }),
});
