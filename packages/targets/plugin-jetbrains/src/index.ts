import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  pluginId: string;         // Numeric JetBrains Plugin ID
  channel?: 'stable' | 'eap';
  projectDir?: string;
  gradleCommand?: string;
  buildTask?: string;
  publishTask?: string;
  artifactPath?: string;
}

function pluginDir(ctx: { projectDir: string }, config: Config): string {
  if (!config.projectDir) return ctx.projectDir;
  return isAbsolute(config.projectDir) ? config.projectDir : join(ctx.projectDir, config.projectDir);
}

function gradleCommand(config: Config): string {
  if (config.gradleCommand) return config.gradleCommand;
  return process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
}

function buildArgs(config: Config): string[] {
  return [config.buildTask ?? 'buildPlugin', '--no-daemon'];
}

function publishArgs(config: Config, channel: string): string[] {
  return [config.publishTask ?? 'publishPlugin', `-PpluginVersionChannel=${channel}`, '--no-daemon'];
}

function artifactPath(ctx: { projectDir: string; version: string }, config: Config): string {
  if (config.artifactPath) {
    return isAbsolute(config.artifactPath) ? config.artifactPath : join(pluginDir(ctx, config), config.artifactPath);
  }
  return join(pluginDir(ctx, config), 'build', 'distributions', `${config.pluginId}-${ctx.version}.zip`);
}

export default defineTarget<Config>({
  id: 'plugin-jetbrains',
  kind: 'plugin',
  label: 'JetBrains Marketplace',
  async build(ctx, config) {
    const cwd = pluginDir(ctx, config);
    const command = gradleCommand(config);
    const args = buildArgs(config);
    const artifact = artifactPath(ctx, config);
    ctx.log(`${command} ${args.join(' ')} (cwd=${cwd})`);

    if (ctx.dryRun) {
      const planPath = join(ctx.outDir, 'jetbrains-build-plan.json');
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, `${JSON.stringify({ cwd, command: [command, ...args], artifact }, null, 2)}\n`, 'utf-8');
      return { artifact: planPath, meta: { command: [command, ...args], cwd, pluginArtifact: artifact } };
    }

    await exec(command, args, {
      cwd,
      env: ctx.env,
      log: ctx.log,
      throwOnNonZero: true,
    });
    return { artifact, meta: { command: [command, ...args], cwd } };
  },
  async ship(ctx, config) {
    const channel = config.channel ?? 'stable';
    const cwd = pluginDir(ctx, config);
    const command = gradleCommand(config);
    const args = publishArgs(config, channel);
    ctx.log(`${command} ${args.join(' ')} (cwd=${cwd})`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: [command, ...args], cwd } };

    const token = ctx.secret('JETBRAINS_TOKEN');
    if (!token) {
      throw new Error('JETBRAINS_TOKEN not in vault. Run: sh1pt secret set JETBRAINS_TOKEN <token>');
    }

    await exec(command, args, {
      cwd,
      env: {
        ...ctx.env,
        JETBRAINS_TOKEN: token,
        PUBLISH_TOKEN: token,
        ORG_GRADLE_PROJECT_intellijPublishToken: token,
      },
      log: ctx.log,
      throwOnNonZero: true,
    });

    return {
      id: `${config.pluginId}@${ctx.version}`,
      url: `https://plugins.jetbrains.com/plugin/${config.pluginId}`,
    };
  },
  async status(id) {
    const [pluginId] = id.split('@');
    return { state: 'live', url: `https://plugins.jetbrains.com/plugin/${pluginId}` };
  },
  setup: manualSetup({
    label: 'JetBrains Marketplace',
    vendorDocUrl: 'https://plugins.jetbrains.com/docs/intellij/publishing-plugin.html',
    steps: [
      'Register your plugin at https://plugins.jetbrains.com',
      'Note the numeric plugin ID from the plugin page URL',
      'Generate a Permanent Token at https://plugins.jetbrains.com/author/me/tokens',
      'Run: sh1pt secret set JETBRAINS_TOKEN <your-token>',
    ],
  }),
});
