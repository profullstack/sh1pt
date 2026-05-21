import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Twitch Helix API. OAuth 2.0; "post" here means stream announcements,
// channel updates, and chat messages via the Helix /chat/messages endpoint.
interface Config {
  broadcasterId: string;
  senderId?: string;
  forSourceOnly?: boolean;
  replyParentMessageId?: string;
  baseUrl?: string;
}

interface TwitchUsersResponse {
  data?: Array<{
    id?: string;
    login?: string;
    display_name?: string;
  }>;
  message?: string;
}

interface TwitchChatMessageResponse {
  data?: Array<{
    message_id?: string;
    is_sent?: boolean;
    drop_reason?: {
      code?: string;
      message?: string;
    };
  }>;
  message?: string;
}

export default defineSocial<Config>({
  id: 'social-twitch',
  label: 'Twitch',
  requires: { maxBodyChars: 500, maxHashtags: 0, hashtagsInBody: true },

  async connect(ctx, config) {
    const auth = requireAuth(ctx);
    const response = await fetch(`${apiBase(config)}/users?id=${encodeURIComponent(config.broadcasterId)}`, {
      headers: helixHeaders(auth),
    });
    const data = await readJson<TwitchUsersResponse>(response);
    if (!response.ok) throw new Error(`Twitch connect failed: ${twitchErrorMessage(data, response.statusText, auth.token)}`);
    return { accountId: data.data?.[0]?.id ?? config.broadcasterId };
  },

  async post(ctx, post, config) {
    const auth = requireAuth(ctx);
    const senderId = config.senderId ?? ctx.secret('TWITCH_SENDER_ID');
    if (!senderId) throw new Error('TWITCH_SENDER_ID not in vault or config.senderId not set');

    ctx.log(`twitch chat/announcement · broadcaster=${config.broadcasterId} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://twitch.tv/', platform: 'twitch', publishedAt: new Date().toISOString() };

    const response = await fetch(`${apiBase(config)}/chat/messages`, {
      method: 'POST',
      headers: helixHeaders(auth),
      body: JSON.stringify(formatChatMessage(post, config, senderId)),
    });
    const data = await readJson<TwitchChatMessageResponse>(response);
    if (!response.ok) throw new Error(`Twitch chat message failed: ${twitchErrorMessage(data, response.statusText, auth.token)}`);

    const message = data.data?.[0];
    if (!message?.is_sent) {
      throw new Error(twitchErrorMessage(data, message?.drop_reason?.message ?? 'Twitch did not send the chat message', auth.token));
    }
    if (!message.message_id) throw new Error('Twitch chat response did not include a message id');

    return {
      id: message.message_id,
      url: 'https://www.twitch.tv/',
      platform: 'twitch',
      publishedAt: new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: 'TWITCH_ACCESS_TOKEN',
    label: 'Twitch',
    vendorDocUrl: 'https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/',
    steps: [
      'Open dev.twitch.tv → Console → Applications → Register Your Application',
      'Add OAuth redirect URL http://127.0.0.1:8765/callback and select scopes: user:write:chat, user:bot, channel:bot, channel:manage:broadcast, moderator:manage:announcements',
      'Store the app client id as TWITCH_CLIENT_ID and the sender user id as TWITCH_SENDER_ID or pass config.senderId',
      'Run the auth flow as the broadcaster account and copy the access token',
    ],
    ...(process.env.SH1PT_TWITCH_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_TWITCH_CLIENT_ID,
            authUrl: 'https://id.twitch.tv/oauth2/authorize',
            tokenUrl: 'https://id.twitch.tv/oauth2/token',
            scopes: ['user:write:chat', 'user:bot', 'channel:bot', 'channel:manage:broadcast', 'moderator:manage:announcements'],
          },
        }
      : {}),
  }),
});

interface TwitchAuth {
  token: string;
  clientId: string;
}

function requireAuth(ctx: { secret(k: string): string | undefined }): TwitchAuth {
  const token = ctx.secret('TWITCH_ACCESS_TOKEN');
  if (!token) throw new Error('TWITCH_ACCESS_TOKEN not in vault — run `sh1pt secret set TWITCH_ACCESS_TOKEN`');
  const clientId = ctx.secret('TWITCH_CLIENT_ID');
  if (!clientId) throw new Error('TWITCH_CLIENT_ID not in vault — run `sh1pt secret set TWITCH_CLIENT_ID`');
  return { token, clientId };
}

function helixHeaders(auth: TwitchAuth): Record<string, string> {
  return {
    authorization: `Bearer ${auth.token}`,
    'client-id': auth.clientId,
    'content-type': 'application/json',
  };
}

function apiBase(config: Config): string {
  return (config.baseUrl ?? 'https://api.twitch.tv/helix').replace(/\/+$/, '');
}

function formatChatMessage(post: SocialPost, config: Config, senderId: string): Record<string, unknown> {
  return {
    broadcaster_id: config.broadcasterId,
    sender_id: senderId,
    message: postMessage(post),
    ...(config.replyParentMessageId ? { reply_parent_message_id: config.replyParentMessageId } : {}),
    ...(config.forSourceOnly === undefined ? {} : { for_source_only: config.forSourceOnly }),
  };
}

function postMessage(post: SocialPost): string {
  const text = [post.body.trim(), post.link?.trim()].filter(Boolean).join('\n');
  if (!text) throw new Error('Twitch chat message cannot be empty');
  return text.length > 500 ? text.slice(0, 499) + '…' : text;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
}

function twitchErrorMessage(data: TwitchUsersResponse | TwitchChatMessageResponse | unknown, fallback: string, token: string): string {
  const response = data as TwitchUsersResponse | TwitchChatMessageResponse;
  const message = response.message ?? (response as TwitchChatMessageResponse).data?.[0]?.drop_reason?.message ?? fallback;
  return token ? message.split(token).join('[redacted]') : message;
}
