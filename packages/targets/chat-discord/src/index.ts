import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Discord apps — bots, slash commands, message components, modals.
// Distribution surfaces:
//   'private':   use in one server only, no directory listing
//   'public':    invite link anywhere (needs verification if >75 servers)
//   'directory': App Directory listing (review required, public only)
interface Config {
  applicationId: string;
  distribution: 'private' | 'public' | 'directory';
  interactionsEndpointUrl?: string;      // HTTP interactions target (alternative to gateway)
  slashCommands?: {
    name: string;
    description: string;
    options?: unknown[];                 // Discord's ApplicationCommandOption shape
  }[];
  scopes?: ('bot' | 'applications.commands')[];
  permissions?: number;                  // bitfield
}

export default defineTarget<Config>({
  id: 'chat-discord',
  kind: 'chat',
  label: 'Discord App Directory',
  async build(ctx, config) {
    ctx.log(`render discord command manifest · ${config.slashCommands?.length ?? 0} commands`);
    return { artifact: `${ctx.outDir}/discord-commands.json` };
  },
  async ship(ctx, config) {
    ctx.log(`discord · bulk overwrite commands + update application${config.distribution === 'directory' ? ' + submit for review' : ''}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - PUT /applications/:id/commands (bulk overwrite global slash commands)
    //  - PATCH /applications/:id (description, icon, tags, interactions URL)
    //  - if distribution='directory': apps.submit via Developer Portal (manual UI currently)
    return {
      id: `${config.applicationId}@${ctx.version}`,
      url: `https://discord.com/developers/applications/${config.applicationId}`,
    };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: "Discord App Directory",
    vendorDocUrl: "https://discord.com/developers/applications",
    steps: [
      "discord.com/developers/applications \u2192 New Application",
      "Complete bot identity + verification for 100+ guild distribution",
      "Run: sh1pt secret set DISCORD_APP_TOKEN <token>",
    ],
  }),
});
