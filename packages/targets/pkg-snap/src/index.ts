import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  snapName: string;          // e.g. "myapp"
  grade?: 'stable' | 'devel';
  confinement?: 'strict' | 'classic' | 'devmode';
  base?: 'core22' | 'core24' | 'bare';
  architectures?: ('amd64' | 'arm64' | 'armhf' | 'i386' | 'riscv64' | 's390x')[];
  channel?: 'stable' | 'candidate' | 'beta' | 'edge';
  summary?: string;
  description?: string;
  command?: string;
  source?: string;
  plugin?: 'dump' | 'npm' | 'make' | 'nil' | string;
  plugs?: string[];
  stagePackages?: string[];
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderList(values: string[], indent: string): string[] {
  return values.map((value) => `${indent}- ${yamlString(value)}`);
}

function renderDescription(description: string): string[] {
  return [
    'description: |',
    ...description.split('\n').map((line) => `  ${line}`),
  ];
}

/**
 * Validate a Snap Store package name.
 * Rules: lowercase letters, digits, and hyphens only; at least one letter;
 * no leading or trailing hyphen; max 40 characters.
 */
function validateSnapName(snapName: string): void {
  if (!snapName || typeof snapName !== 'string') {
    throw new Error('pkg-snap: snapName is required');
  }
  if (snapName.length > 40) {
    throw new Error(`pkg-snap: snapName "${snapName}" exceeds 40 characters`);
  }
  if (snapName.startsWith('-') || snapName.endsWith('-')) {
    throw new Error(`pkg-snap: snapName "${snapName}" must not start or end with a hyphen`);
  }
  if (snapName.includes('--')) {
    throw new Error(`pkg-snap: snapName "${snapName}" must not contain consecutive hyphens`);
  }
  if (!/^[a-z0-9-]+$/.test(snapName)) {
    throw new Error(`pkg-snap: snapName "${snapName}" must contain only lowercase letters, digits, and hyphens`);
  }
  if (!/[a-z]/.test(snapName)) {
    throw new Error(`pkg-snap: snapName "${snapName}" must contain at least one letter`);
  }
}

function renderSnapcraftYaml(ctx: { projectDir: string; version: string; channel: string }, config: Config): string {
  validateSnapName(config.snapName);
  const grade = config.grade ?? (ctx.channel === 'stable' ? 'stable' : 'devel');
  const confinement = config.confinement ?? 'strict';
  const base = config.base ?? 'core22';
  const arches = config.architectures ?? ['amd64', 'arm64'];
  const command = config.command ?? `bin/${config.snapName}`;
  const source = config.source ?? ctx.projectDir;
  const plugin = config.plugin ?? 'dump';
  const description = config.description ?? `${config.snapName} packaged by sh1pt.`;
  const lines = [
    `name: ${yamlString(config.snapName)}`,
    `base: ${yamlString(base)}`,
    `version: ${yamlString(ctx.version)}`,
    `summary: ${yamlString(config.summary ?? `${config.snapName} release`)}`,
    ...renderDescription(description),
    `grade: ${yamlString(grade)}`,
    `confinement: ${yamlString(confinement)}`,
    'architectures:',
    ...arches.flatMap((arch) => [
      `  - build-on: ${yamlString(arch)}`,
      `    build-for: ${yamlString(arch)}`,
    ]),
    'apps:',
    `  ${config.snapName}:`,
    `    command: ${yamlString(command)}`,
  ];

  if (config.plugs?.length) {
    lines.push('    plugs:');
    lines.push(...renderList(config.plugs, '      '));
  }

  lines.push('parts:');
  lines.push(`  ${config.snapName}:`);
  lines.push(`    plugin: ${yamlString(plugin)}`);
  lines.push(`    source: ${yamlString(source)}`);

  if (config.stagePackages?.length) {
    lines.push('    stage-packages:');
    lines.push(...renderList(config.stagePackages, '      '));
  }

  lines.push('');
  return lines.join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-snap',
  kind: 'package-manager',
  label: 'Snapcraft',
  async build(ctx, config) {
    validateSnapName(config.snapName);
    const grade = config.grade ?? (ctx.channel === 'stable' ? 'stable' : 'devel');
    const confinement = config.confinement ?? 'strict';
    const base = config.base ?? 'core22';
    const arches = config.architectures ?? ['amd64', 'arm64'];
    const manifestPath = join(ctx.outDir, 'snap', 'snapcraft.yaml');
    ctx.log(`render snapcraft.yaml for ${config.snapName} v${ctx.version} (${grade}/${confinement})`);
    ctx.log(`architectures: ${arches.join(', ')} | base: ${base}`);
    await mkdir(join(ctx.outDir, 'snap'), { recursive: true });
    await writeFile(manifestPath, renderSnapcraftYaml(ctx, config), 'utf-8');
    // TODO: run `snapcraft --destructive-mode` or `snapcraft remote-build`
    return { artifact: manifestPath };
  },
  async ship(ctx, config) {
    validateSnapName(config.snapName);
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
