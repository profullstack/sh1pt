import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';
import { join } from 'node:path';

interface Config {
  publisher: string;       // e.g. "mycompany"
  extensionName: string;   // e.g. "my-extension"
  packageDir?: string;
  target?: string;         // e.g. "linux-x64" for platform-specific packages
}

export default defineTarget<Config>({
  id: 'plugin-vscode',
  kind: 'plugin',
  label: 'VS Code Marketplace',

  async build(ctx, config) {
    ctx.log('vsce: verifying CLI availability');

    try {
      await exec('npx', ['--yes', 'vsce', '--version'], { log: ctx.log, throwOnNonZero: false });
    } catch {
      ctx.log('vsce not found — installing');
      await exec('npm', ['install', '-g', '@vscode/vsce'], {
        log: ctx.log, throwOnNonZero: true,
      });
    }

    const pkgDir = config.packageDir ? join(ctx.projectDir, config.packageDir) : ctx.projectDir;
    ctx.log(`vsce: packaging ${config.publisher}.${config.extensionName} v${ctx.version}`);

    const args = ['--yes', 'vsce', 'package', '--out', ctx.outDir];
    if (config.target) args.push('--target', config.target);

    const { stdout } = await exec('npx', args, {
      cwd: pkgDir,
      log: ctx.log,
      throwOnNonZero: true,
    });

    return { artifact: `${ctx.outDir}/${config.extensionName}-${ctx.version}.vsix` };
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
