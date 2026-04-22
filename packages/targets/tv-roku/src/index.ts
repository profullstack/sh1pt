import { defineTarget } from '@profullstack/sh1pt-core';

// Roku apps run on BrightScript + SceneGraph. Unlike tvOS / Android TV /
// Fire TV, there is no supported React runtime on Roku OS — react-tv is
// abandoned and third-party transpilers (Plenary) are closed-source. So
// this adapter assumes the user supplies a Roku channel source tree
// (manifest + components/ + images/) rather than sharing the JS codebase.
// Future: evaluate building a BrightScript codegen from a constrained
// React subset; out of scope for the v0 stub.
interface Config {
  channelId?: string;         // Roku-assigned, set after first submission
  developerId: string;        // from Roku Developer Dashboard
  sourceDir: string;          // path to the Roku channel source tree
  // channel type — 'public' goes through Roku review, 'beta' is invite-only
  channelType: 'public' | 'beta' | 'private';
}

export default defineTarget<Config>({
  id: 'tv-roku',
  kind: 'tv',
  label: 'Roku Channel Store',
  async build(ctx, config) {
    ctx.log(`zip Roku channel from ${config.sourceDir}`);
    // TODO:
    //  - validate manifest file (title, version, icon sizes, subtype)
    //  - zip sourceDir into a .zip Roku-Package
    return { artifact: `${ctx.outDir}/channel.zip` };
  },
  async ship(ctx, config) {
    const dest = config.channelType === 'public' ? 'Roku Channel Store review' : `${config.channelType} channel`;
    ctx.log(`upload channel → ${dest}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - Roku Developer Dashboard API: create/update submission → upload zip → submit
    //  - beta/private channels skip public review but still require vetting
    return { id: `${config.channelId ?? 'pending'}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },
});
