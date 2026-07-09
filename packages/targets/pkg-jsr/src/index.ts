import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { join, posix } from 'node:path';

// JSR (jsr.io) - TS-native registry. Publishes source TS directly; the
// registry handles transpilation for Node/Deno/Bun consumers. Scoped packages
// only (@scope/name).
interface Config {
  scope: string;                 // e.g. 'acme'
  packageName: string;           // e.g. 'my-lib' -> @acme/my-lib
  packageDir?: string;           // path with jsr.json / deno.json
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`pkg-jsr requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function jsrSlug(value: string | undefined, field: string): string {
  const slug = requireText(value, field);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`pkg-jsr ${field} must be lowercase letters, numbers, or hyphens`);
  }
  return slug;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    scope: jsrSlug(config.scope, 'scope'),
    packageName: jsrSlug(config.packageName, 'packageName'),
    packageDir: optionalText(config.packageDir, 'packageDir'),
  };
}

function packagePath(ctx: { projectDir: string }, config: Config): string {
  config = normalizedConfig(config);
  if (!config.packageDir) return ctx.projectDir;
  return isWindowsPath(ctx.projectDir) ? join(ctx.projectDir, config.packageDir) : posix.join(ctx.projectDir, config.packageDir);
}

function isWindowsPath(path: string): boolean {
  return path.includes('\\') || /^[A-Za-z]:\//.test(path.replace(/\\/g, '/'));
}

function packageId(config: Config, version: string): string {
  config = normalizedConfig(config);
  return `@${config.scope}/${config.packageName}@${version}`;
}

function packageUrl(config: Config): string {
  config = normalizedConfig(config);
  return `https://jsr.io/@${config.scope}/${config.packageName}`;
}

export default defineTarget<Config>({
  id: 'pkg-jsr',
  kind: 'sdk',
  label: 'JSR (jsr.io - TS-native registry)',
  async build(ctx, config) {
    config = normalizedConfig(config);
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
    config = normalizedConfig(config);
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
