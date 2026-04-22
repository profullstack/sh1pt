import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Slack apps — bots, slash commands, workflows, Block Kit surfaces.
// Two distribution tiers:
//   'workspace': installable in one workspace only (no review)
//   'directory': listed in Slack App Directory (full review, 1-2 weeks)
interface Config {
  appId: string;
  clientId: string;
  distribution: 'workspace' | 'directory';
  requestUrl: string;                // events + interactivity endpoint
  slashCommands?: { command: string; url: string; description: string }[];
  scopes: { bot?: string[]; user?: string[] };
}

export default defineTarget<Config>({
  id: 'chat-slack',
  kind: 'chat',
  label: 'Slack App Directory',
  async build(ctx, config) {
    ctx.log(`render slack app manifest · appId=${config.appId}`);
    // TODO: render Slack App Manifest (YAML/JSON) from config → ctx.outDir
    return { artifact: `${ctx.outDir}/slack-manifest.yaml` };
  },
  async ship(ctx, config) {
    const dest = config.distribution === 'directory' ? 'App Directory (review queue)' : 'workspace (no review)';
    ctx.log(`slack · push app manifest → ${dest}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: apps.manifest.update via app-level token, then apps.submit for directory
    return { id: `${config.appId}@${ctx.version}`, url: `https://api.slack.com/apps/${config.appId}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "Slack App Directory",
    vendorDocUrl: "https://api.slack.com/apps",
    steps: [
      "api.slack.com/apps \u2192 Create New App \u2192 From Manifest",
      "Complete App Directory review (security + scope audit)",
      "Run: sh1pt secret set SLACK_APP_DIRECTORY_TOKEN <token>",
    ],
  }),
});
