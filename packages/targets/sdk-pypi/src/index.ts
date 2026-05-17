import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';
import { join } from 'node:path';

interface Config {
  packageDir?: string;
  repository?: string;  // e.g. 'testpypi' or 'https://upload.pypi.org/legacy/'
}

export default defineTarget<Config>({
  id: 'sdk-pypi',
  kind: 'sdk',
  label: 'PyPI',

  async build(ctx, config) {
    ctx.log('pypi: verifying twine availability');

    try {
      await exec('twine', ['--version'], { log: ctx.log, throwOnNonZero: false });
    } catch {
      ctx.log('twine not found — installing');
      await exec('pip', ['install', 'twine'], {
        log: ctx.log, throwOnNonZero: true,
      });
    }

    // Build the Python package
    const pkgDir = config.packageDir ? join(ctx.projectDir, config.packageDir) : ctx.projectDir;
    ctx.log(`pypi: building distribution in ${pkgDir}`);
    await exec('python', ['-m', 'build', '--outdir', ctx.outDir, pkgDir], {
      log: ctx.log, throwOnNonZero: true,
    });

    return { artifact: ctx.outDir };
  },

  async ship(ctx, config) {
    const token = ctx.secret('PYPI_TOKEN');
    if (!token) {
      throw new Error('PYPI_TOKEN not set. Run: sh1pt secret set PYPI_TOKEN <token>');
    }

    const repository = config.repository ?? 'https://upload.pypi.org/legacy/';
    const repoFlag = config.repository === 'testpypi'
      ? ['--repository', 'testpypi']
      : ['--repository-url', repository];

    ctx.log(`pypi: uploading to ${repository}`);
    if (ctx.dryRun) {
      ctx.log('pypi: dry-run — would upload distribution');
      return { id: 'dry-run', meta: { repository } };
    }

    const { stdout } = await exec(
      'twine',
      [
        'upload',
        ...repoFlag,
        '--username', '__token__',
        '--password', token,
        '--non-interactive',
        `${ctx.artifact}/*`,
      ],
      { log: ctx.log, throwOnNonZero: true }
    );

    return {
      id: `pypi-${Date.now()}`,
      url: `https://pypi.org/project/${ctx.version}/`,
      meta: { raw: stdout.trim() },
    };
  },

  async status(id) {
    return { state: 'live', url: `https://pypi.org/project/${id}/` };
  },

  setup: setupGuide({
    label: 'PyPI',
    vendorDocUrl: 'https://pypi.org/help/#apitoken',
    steps: [
      'Install build tools: pip install build twine',
      'Create an API token at https://pypi.org/manage/account/token/',
      'Run: sh1pt secret set PYPI_TOKEN pypi-xxxxxxxx',
    ],
  }),
});
