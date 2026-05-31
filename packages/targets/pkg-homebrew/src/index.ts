import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  tap: string;               // e.g. "myorg/homebrew-tap"
  formulaName: string;       // e.g. "sh1pt"
  binaries: { url: string; sha256: string; platform: 'darwin-x64' | 'darwin-arm64' | 'linux-x64' | 'linux-arm64' }[];
  desc?: string;
  homepage?: string;
  license?: string;
  binaryName?: string;
  testArgs?: string[];
}

type Binary = Config['binaries'][number];
type Os = 'darwin' | 'linux';

function rubyString(value: string): string {
  return JSON.stringify(value);
}

function formulaClassName(formulaName: string): string {
  const parts = formulaName.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = parts
    .map((part) => {
      const normalized = part[0]!.toUpperCase() + part.slice(1);
      return /^\d/.test(normalized) ? `V${normalized}` : normalized;
    })
    .join('');
  return name || 'Sh1ptFormula';
}

function assertFormulaName(formulaName: string): void {
  if (!/^[a-z0-9][a-z0-9@._+-]*$/.test(formulaName)) {
    throw new Error(`formulaName must be a lowercase Homebrew formula name, got "${formulaName}"`);
  }
}

function osFor(platform: Binary['platform']): Os {
  return platform.startsWith('darwin') ? 'darwin' : 'linux';
}

function cpuPredicate(platform: Binary['platform']): string {
  return platform.endsWith('arm64') ? 'arm?' : 'intel?';
}

function renderPlatformBlocks(binaries: Binary[]): string {
  const blocks: string[] = [];

  for (const os of ['darwin', 'linux'] as const) {
    const osBinaries = binaries.filter((binary) => osFor(binary.platform) === os);
    if (osBinaries.length === 0) continue;

    blocks.push(`  on_${os === 'darwin' ? 'macos' : 'linux'} do`);
    for (const binary of osBinaries) {
      blocks.push(`    if Hardware::CPU.${cpuPredicate(binary.platform)}`);
      blocks.push(`      url ${rubyString(binary.url)}`);
      blocks.push(`      sha256 ${rubyString(binary.sha256)}`);
      blocks.push('    end');
    }
    blocks.push('  end');
    blocks.push('');
  }

  return blocks.join('\n').trimEnd();
}

function renderFormula(config: Config, version: string): string {
  assertFormulaName(config.formulaName);
  if (!config.binaries?.length) {
    throw new Error('Homebrew formula requires at least one binary download');
  }

  const binaryName = config.binaryName ?? config.formulaName;
  const testArgs = config.testArgs ?? ['--version'];
  const lines = [
    `class ${formulaClassName(config.formulaName)} < Formula`,
    `  desc ${rubyString(config.desc ?? `${config.formulaName} command-line release`)}`,
    `  homepage ${rubyString(config.homepage ?? `https://github.com/${config.tap}`)}`,
    `  version ${rubyString(version)}`,
  ];

  if (config.license) {
    lines.push(`  license ${rubyString(config.license)}`);
  }

  lines.push('');
  lines.push(renderPlatformBlocks(config.binaries));
  lines.push('');
  lines.push('  def install');
  lines.push(`    bin.install ${rubyString(binaryName)}`);
  lines.push('  end');
  lines.push('');
  lines.push('  test do');
  lines.push(`    system "#{bin}/${binaryName}", ${testArgs.map(rubyString).join(', ')}`);
  lines.push('  end');
  lines.push('end');
  lines.push('');

  return lines.join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-homebrew',
  kind: 'package-manager',
  label: 'Homebrew',
  async build(ctx, config) {
    assertFormulaName(config.formulaName);
    const formula = renderFormula(config, ctx.version);
    const formulaPath = join(ctx.outDir, `${config.formulaName}.rb`);
    ctx.log(`render Formula/${config.formulaName}.rb`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(formulaPath, formula, 'utf-8');
    return { artifact: formulaPath };
  },
  async ship(ctx, config) {
    assertFormulaName(config.formulaName);
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
