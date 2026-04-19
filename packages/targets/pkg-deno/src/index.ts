import { defineTarget } from '@sh1pt/core';

// deno.land/x — the older Deno registry. No real "publish" — it
// auto-imports from a linked GitHub repo whenever a git tag is pushed
// that matches the configured pattern. Superseded by JSR for most use
// cases but still a common URL pattern in the Deno ecosystem.
interface Config {
  moduleName: string;            // registered at deno.land/x/<moduleName>
  sourceRepo: string;            // e.g. 'acme/my-lib' — must be pre-linked
  tagPrefix?: string;            // e.g. 'v' — default: empty
}

export default defineTarget<Config>({
  id: 'pkg-deno',
  kind: 'sdk',
  label: 'deno.land/x (git-tag registry)',
  async build(ctx, config) {
    ctx.log(`no-op build — deno.land/x pulls from ${config.sourceRepo} on tag push`);
    return { artifact: ctx.projectDir };
  },
  async ship(ctx, config) {
    const tag = `${config.tagPrefix ?? ''}${ctx.version}`;
    ctx.log(`git tag ${tag} + push · deno.land/x/${config.moduleName}@${tag}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: git tag + git push --tags via GH_TOKEN; deno.land's webhook publishes automatically
    return {
      id: `${config.moduleName}@${tag}`,
      url: `https://deno.land/x/${config.moduleName}@${tag}`,
    };
  },
});
