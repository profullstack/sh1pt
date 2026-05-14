import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  publisher: string;       // e.g. "mycompany"
  extensionName: string;   // e.g. "my-extension"
  packageDir?: string;
  target?: string;         // e.g. "linux-x64" for platform-specific packages
}

function packageDir(ctx: { projectDir: string }, config: Config): string {
  return config.packageDir ? join(ctx.projectDir, config.packageDir) : ctx.projectDir;
}

function packageArtifact(ctx: { outDir: string; version: string }, config: Config): string {
  return join(ctx.outDir, `${config.extensionName}-${ctx.version}.vsix`);
}

function packageArgs(ctx: { outDir: string }, config: Config): string[] {
  const args = ['--yes', 'vsce', 'package', '--out', ctx.outDir];
  if (config.target) args.push('--target', config.target);
  return args;
}

function renderPackagePlan(ctx: { projectDir: string; outDir: string; version: string }, config: Config): string {
  return `${JSON.stringify({
    provider: 'vscode-marketplace',
    publisher: config.publisher,
    extensionName: config.extensionName,
    version: ctx.version,
    packageDir: packageDir(ctx, config),
    artifact: packageArtifact(ctx, config),
    command: ['npx', ...packageArgs(ctx, config)],
  }, null, 2)}\n`;
}

export default defineTarget<Config>({
  id: 'plugin-vscode',
  kind: 'plugin',
  label: 'VS Code Marketplace',

  async build(ctx, config) {
    if (ctx.dryRun) {
      const planPath = join(ctx.outDir, 'vscode-package.json');
      ctx.log(`vsce: dry-run package plan for ${config.publisher}.${config.extensionName} v${ctx.version}`);
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, renderPackagePlan(ctx, config), 'utf-8');
      return { artifact: planPath };
    }

    ctx.log('vsce: verifying CLI availability');

    try {
      await exec('npx', ['--yes', 'vsce', '--version'], { log: ctx.log, throwOnNonZero: false });
    } catch {
      ctx.log('vsce not found — installing');
      await exec('npm', ['install', '-g', '@vscode/vsce'], {
        log: ctx.log, throwOnNonZero: true,
      });
    }

    const pkgDir = packageDir(ctx, config);
    ctx.log(`vsce: packaging ${config.publisher}.${config.extensionName} v${ctx.version}`);

    const args = packageArgs(ctx, config);

    const { stdout } = await exec('npx', args, {
      cwd: pkgDir,
      log: ctx.log,
      throwOnNonZero: true,
    });

    return { artifact: packageArtifact(ctx, config) };
  },

  async ship(ctx, config) {
    ctx.log(`vsce: publishing ${config.publisher}.${config.extensionName}@${ctx.version} to VS Code Marketplace`);

    const token = ctx.secret('VSCE_TOKEN');
    if (!token) {
      throw new Error('VSCE_TOKEN not set. Run: sh1pt secret set VSCE_TOKEN <pat>');
    }

    if (ctx.dryRun) {
      ctx.log('vsce: dry-run — would publish extension');
      return { id: 'dry-run' };
    }

    await exec('npx', ['--yes', 'vsce', 'publish', '--pat', token, '--packagePath', ctx.artifact], {
      log: ctx.log,
      throwOnNonZero: true,
    });

    return {
      id: `${config.publisher}.${config.extensionName}@${ctx.version}`,
      url: `https://marketplace.visualstudio.com/items?itemName=${config.publisher}.${config.extensionName}`,
    };
  },

  async status(id) {
    const [extId] = id.split('@');
    return { state: 'live', url: `https://marketplace.visualstudio.com/items?itemName=${extId}` };
  },

  setup: setupGuide({
    label: 'VS Code Marketplace',
    vendorDocUrl: 'https://code.visualstudio.com/api/working-with-extensions/publishing-extension',
    steps: [
      'Install vsce: npm install -g @vscode/vsce',
      'Create a publisher at https://marketplace.visualstudio.com/manage',
      'Generate a Personal Access Token with Marketplace > Publish scope',
      'Run: sh1pt secret set VSCE_TOKEN <your-pat>',
      'Ensure package.json has publisher and name fields matching config',
    ],
  }),
});
