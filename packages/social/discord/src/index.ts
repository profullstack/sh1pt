import { defineSocial, webhookUrlSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Discord — channel webhooks are the simplest publish path (one URL per
// channel, no bot identity to manage). For richer automation (slash
// commands, reactions, threads) wire up an OAuth bot separately.
interface Config {
  channelLabel?: string;
  username?: string;
  avatarUrl?: string;
}

export default defineSocial<Config>({
  id: 'social-discord',
  label: 'Discord',
  requires: { maxBodyChars: 2000, maxHashtags: 0, hashtagsInBody: true },

  async connect(ctx) {
    if (!ctx.secret('DISCORD_WEBHOOK_URL')) throw new Error('DISCORD_WEBHOOK_URL not in vault — run: sh1pt secret set DISCORD_WEBHOOK_URL <webhook-url>');
    return { accountId: 'webhook' };
  },

  async post(ctx, post, config) {
    const webhookUrl = ctx.secret('DISCORD_WEBHOOK_URL');
    if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL not in vault — run: sh1pt secret set DISCORD_WEBHOOK_URL <webhook-url>');
    ctx.log(`discord message · ${post.body.length} chars · media=${post.media?.length ?? 0}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://discord.com/', platform: 'discord', publishedAt: new Date().toISOString() };

    const res = await fetch(withWait(webhookUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(formatDiscordPost(post, config)),
    });
    if (!res.ok) {
      throw new Error(await readDiscordError(res));
    }

    const message = await res.json() as DiscordMessage;
    return {
      id: message.id,
      url: messageUrl(message),
      platform: 'discord',
      publishedAt: new Date(message.timestamp).toISOString(),
    };
  },

  setup: webhookUrlSetup({
    secretKey: 'DISCORD_WEBHOOK_URL',
    label: 'Discord (channel webhook)',
    urlPrefix: 'https://discord.com/api/webhooks/',
    vendorDocUrl: 'https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks',
    steps: [
      'Server settings → Integrations → Webhooks → New Webhook',
      'Pick the target channel, name the webhook, copy the URL',
      'Paste it below — anyone with this URL can post to the channel',
    ],
  }),
});

interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  timestamp: string;
}

function formatDiscordPost(post: SocialPost, config: Config): unknown {
  const link = post.link ? `\n${post.link}` : '';
  return {
    content: `${post.body}${link}`.slice(0, 2000),
    username: config.username,
    avatar_url: config.avatarUrl,
  };
}

function withWait(webhookUrl: string): string {
  const separator = webhookUrl.includes('?') ? '&' : '?';
  return `${webhookUrl}${separator}wait=true`;
}

async function readDiscordError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return res.statusText;
  try {
    const data = JSON.parse(text) as { message?: string };
    return data.message ?? text;
  } catch {
    return text;
  }
}

function messageUrl(message: DiscordMessage): string {
  if (!message.channel_id) return 'https://discord.com/';
  const guild = message.guild_id ?? '@me';
  return `https://discord.com/channels/${guild}/${message.channel_id}/${message.id}`;
}
