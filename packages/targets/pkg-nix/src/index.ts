import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  pname: string;             // e.g. "myapp"
  nixpkgsRepo?: string;      // GitHub repo, defaults to NixOS/nixpkgs
  attrPath?: string;         // e.g. "nodePackages.myapp"
  maintainerHandle?: string; // your nixpkgs GitHub handle
  sourceRepo?: string;       // GitHub source repo, e.g. "myorg/myapp"
  rev?: string;
  sha256?: string;
  description?: string;
  homepage?: string;
  license?: string;          // e.g. "licenses.mit"
  platforms?: string;        // e.g. "platforms.unix"
  mainProgram?: string;
  buildInputs?: string[];
  nativeBuildInputs?: string[];
  installPhase?: string;
}

function nixVersion(version: string): string {
  return version.replace(/^v/, '');
}

function nixString(value: string): string {
  return JSON.stringify(value);
}

function parseRepo(sourceRepo: string | undefined, pname: string): { owner: string; repo: string } {
  const [owner, repo] = (sourceRepo ?? `profullstack/${pname}`).split('/');
  return {
    owner: owner || 'profullstack',
    repo: repo || pname,
  };
}

function nixList(values: string[] | undefined): string {
  return values?.length ? `[ ${values.join(' ')} ]` : '[ ]';
}

function nixIndentedString(value: string): string {
  return value.replaceAll("''", "'''").replaceAll('${', "''${");
}

function defaultInstallPhase(config: Config): string {
  const mainProgram = config.mainProgram ?? config.pname;
  return [
    'runHook preInstall',
    `mkdir -p $out/share/${config.pname}`,
    `cp -R . $out/share/${config.pname}/`,
    'mkdir -p $out/bin',
    `ln -s $out/share/${config.pname}/${mainProgram} $out/bin/${mainProgram} || true`,
    'runHook postInstall',
  ].join('\n');
}

function renderDefaultNix(ctx: { version: string }, config: Config): string {
  const version = nixVersion(ctx.version);
  const { owner, repo } = parseRepo(config.sourceRepo, config.pname);
  const license = config.license ?? 'licenses.mit';
  const platforms = config.platforms ?? 'platforms.unix';
  const maintainer = config.maintainerHandle ? `\n    maintainers = with maintainers; [ ${config.maintainerHandle} ];` : '';
  return [
    '{ lib, stdenv, fetchFromGitHub }:',
    '',
    'stdenv.mkDerivation rec {',
    `  pname = ${nixString(config.pname)};`,
    `  version = ${nixString(version)};`,
    '',
    '  src = fetchFromGitHub {',
    `    owner = ${nixString(owner)};`,
    `    repo = ${nixString(repo)};`,
    `    rev = ${nixString(config.rev ?? `v${version}`)};`,
    `    hash = ${config.sha256 ? nixString(config.sha256) : 'lib.fakeHash'};`,
    '  };',
    '',
    `  nativeBuildInputs = ${nixList(config.nativeBuildInputs)};`,
    `  buildInputs = ${nixList(config.buildInputs)};`,
    '',
    "  installPhase = ''",
    nixIndentedString(config.installPhase ?? defaultInstallPhase(config)).split('\n').map((line) => `    ${line}`).join('\n'),
    "  '';",
    '',
    '  meta = with lib; {',
    `    description = ${nixString(config.description ?? `Release package for ${config.pname}`)};`,
    `    homepage = ${nixString(config.homepage ?? 'https://sh1pt.com')};`,
    `    license = ${license};`,
    `    platforms = ${platforms};`,
    `    mainProgram = ${nixString(config.mainProgram ?? config.pname)};${maintainer}`,
    '  };',
    '}',
    '',
  ].join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-nix',
  kind: 'package-manager',
  label: 'nixpkgs',
  async build(ctx, config) {
    const expressionPath = join(ctx.outDir, 'default.nix');
    ctx.log(`generate default.nix for ${config.pname} v${ctx.version}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(expressionPath, renderDefaultNix(ctx, config), 'utf-8');
    return { artifact: expressionPath };
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
