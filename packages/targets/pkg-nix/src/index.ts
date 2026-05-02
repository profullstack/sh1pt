import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  pname: string;             // e.g. "myapp"
  nixpkgsRepo?: string;      // GitHub repo, defaults to NixOS/nixpkgs
  attrPath?: string;         // e.g. "nodePackages.myapp"
  maintainerHandle?: string; // your nixpkgs GitHub handle
}

export default defineTarget<Config>({
  id: 'pkg-nix',
  kind: 'package-manager',
  label: 'nixpkgs',
  async build(ctx, config) {
    ctx.log(`generate default.nix for ${config.pname} v${ctx.version}`);
    // TODO: render default.nix / package.nix expression from template
    // Includes src hash (fetchFromGitHub), buildInputs, meta block
    return { artifact: `${ctx.outDir}/default.nix` };
  },
  async ship(ctx, config) {
    const repo = config.nixpkgsRepo ?? 'NixOS/nixpkgs';
    ctx.log(`open nixpkgs PR for ${config.pname}@${ctx.version} \u2192 ${repo}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: fork nixpkgs, apply nix expression patch, open PR via GitHub API
    // Uses GITHUB_TOKEN from ctx.secret('GITHUB_TOKEN')
    return {
      id: `${config.pname}@${ctx.version}`,
      url: `https://github.com/${repo}/pulls`,
    };
  },
  async status(id) {
    const [pname] = id.split('@');
    return { state: 'live', url: `https://search.nixos.org/packages?query=${pname}` };
  },
  setup: manualSetup({
    label: 'nixpkgs',
    vendorDocUrl: 'https://github.com/NixOS/nixpkgs/blob/master/pkgs/README.md',
    steps: [
      'Run: sh1pt secret set GITHUB_TOKEN <pat-with-repo-scope>',
      'Ensure your package has a reproducible build with a pinned source hash',
      'sh1pt will fork NixOS/nixpkgs, add/update the Nix expression, and open a PR',
      'Follow https://github.com/NixOS/nixpkgs/blob/master/CONTRIBUTING.md for review guidelines',
    ],
  }),
});
