import { defineTarget } from '@sh1pt/core';

// JSR (jsr.io) — TS-native registry. Publishes source TS directly; the
// registry handles transpilation for Node/Deno/Bun consumers. No
// pre-publish build step required. Scoped packages only (@scope/name).
interface Config {
  scope: string;                 // e.g. 'acme'
  packageName: string;           // e.g. 'my-lib' → @acme/my-lib
  packageDir?: string;           // path with jsr.json / deno.json
}

export default defineTarget<Config>({
  id: 'pkg-jsr',
  kind: 'sdk',
  label: 'JSR (jsr.io — TS-native registry)',
  async build(ctx, config) {
    ctx.log(`jsr publish --dry-run · pkg=@${config.scope}/${config.packageName}`);
    // TODO: run `jsr publish --dry-run` to validate jsr.json and type coverage
    return { artifact: config.packageDir ?? ctx.projectDir };
  },
  async ship(ctx, config) {
    ctx.log(`jsr publish · @${config.scope}/${config.packageName}@${ctx.version}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: `npx jsr publish` or `deno publish` with JSR_TOKEN
    return {
      id: `@${config.scope}/${config.packageName}@${ctx.version}`,
      url: `https://jsr.io/@${config.scope}/${config.packageName}`,
    };
  },
});
