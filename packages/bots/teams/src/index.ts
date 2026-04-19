import { defineBot } from '@sh1pt/core';

// Microsoft Teams bot — Bot Framework (Azure Bot Service) with Teams
// channel enabled. Needs TEAMS_APP_ID + TEAMS_APP_PASSWORD (app registration
// in Entra). Adaptive Cards render reply.actions.
interface Config { appId?: string; tenantId?: string }

export default defineBot<Config>({
  id: 'bot-teams',
  label: 'Microsoft Teams',
  supports: ['message', 'command', 'interaction', 'join', 'leave'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('TEAMS_APP_PASSWORD')) throw new Error('TEAMS_APP_PASSWORD not in vault');
    ctx.log(`bot-teams · register ${handlers.length} handlers (app=${config.appId ?? 'unset'})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: host Bot Framework endpoint /api/messages; validate JWT.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('TEAMS_APP_PASSWORD')) throw new Error('TEAMS_APP_PASSWORD not in vault');
    ctx.log(`bot-teams · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST to conversation reference with Adaptive Card payload.
    return { id: `tm_${Date.now()}` };
  },
});
