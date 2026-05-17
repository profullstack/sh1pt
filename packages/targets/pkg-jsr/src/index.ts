import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { join } from 'node:path';

// JSR (jsr.io) - TS-native registry. Publishes source TS directly; the
// registry handles transpilation for Node/Deno/Bun consumers. Scoped packages
// only (@scope/name).
interface Config {
  scope: string;                 // e.g. 'acme'
  packageName: string;           // e.g. 'my-lib' -> @acme/my-lib
  packageDir?: string;           // path with jsr.json / deno.json
}

function packagePath(ctx: { projectDir: string }, config: Config): string {
  return config.packageDir ? join(ctx.projectDir, config.packageDir) : ctx.projectDir;
}

function packageId(config: Config, version: string): string {
  return `@${config.scope}/${config.packageName}@${version}`;
}

function packageUrl(config: Config): string {
  return `https://jsr.io/@${config.scope}/${config.packageName}`;
}

export default defineTarget<Config>({
  id: 'pkg-jsr',
  kind: 'sdk',
  label: 'JSR (jsr.io - TS-native registry)',
  async build(ctx, config) {
    const cwd = packagePath(ctx, config);
    ctx.log(`jsr publish --dry-run for @${config.scope}/${config.packageName}`);
    await exec('npx', ['--yes', 'jsr', 'publish', '--dry-run'], {
      cwd,
      log: ctx.log,
      env: ctx.env,
      throwOnNonZero: true,
    });
    return { artifact: cwd };
  },
  async ship(ctx, config) {
    ctx.log(`jsr publish for @${config.scope}/${config.packageName}@${ctx.version}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('JSR_TOKEN');
    if (!token) {
      throw new Error('JSR_TOKEN secret not set. Run: sh1pt secret set JSR_TOKEN <token>');
    }

    await exec('npx', ['--yes', 'jsr', 'publish', '--token', token], {
      cwd: packagePath(ctx, config),
      log: ctx.log,
      env: { ...ctx.env, JSR_TOKEN: token },
      throwOnNonZero: true,
    });

    return {
      id: packageId(config, ctx.version),
      url: packageUrl(config),
    };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: "JSR (jsr.io)",
    vendorDocUrl: "https://jsr.io/account/tokens",
    steps: [
      "Open jsr.io -> sign in with GitHub -> Account -> Tokens -> Create",
      "Create a token with Publish permission for the target scope",
      "Run: sh1pt secret set JSR_TOKEN <token>",
    ],
  }),
});
