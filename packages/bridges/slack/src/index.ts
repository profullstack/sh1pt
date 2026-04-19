import { defineBridge } from '@sh1pt/core';

// Slack bridge — Socket Mode for receive (no public HTTP endpoint
// required), chat.postMessage for send. Bot needs channels:history,
// channels:read, chat:write, app_mentions:read scopes + Socket Mode
// enabled on the app.
interface Config {
  appId?: string;
}

export default defineBridge<Config>({
  id: 'bridge-slack',
  label: 'Slack',

  async subscribe(ctx, channels, onMessage) {
    if (!ctx.secret('SLACK_APP_TOKEN') || !ctx.secret('SLACK_BOT_TOKEN')) {
      throw new Error('SLACK_APP_TOKEN + SLACK_BOT_TOKEN required in vault (Socket Mode)');
    }
    ctx.log(`slack bridge · subscribing via Socket Mode to ${channels.length} channels`);
    // TODO: WebSocket to wss://wss-primary.slack.com/...; filter
    // message events to subscribed channel ids.
    return { async close() {} };
  },

  async send(ctx, channel, msg) {
    if (!ctx.secret('SLACK_BOT_TOKEN')) throw new Error('SLACK_BOT_TOKEN not in vault');
    ctx.log(`slack bridge send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST https://slack.com/api/chat.postMessage with
    //   { channel, text, username: msg.identity.username + ` [${msg.originalNetwork}]`,
    //     icon_url: msg.identity.avatarUrl, blocks: [...] }
    return { id: `s_${Date.now()}` };
  },
});
