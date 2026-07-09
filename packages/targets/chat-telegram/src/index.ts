import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Telegram bots. No "store" means a bot is just a token + webhook URL. This
// adapter registers the webhook with Telegram, sets commands/description/
// about text, and optionally submits to bot directories (t.me/BotFather,
// storebot.me, combot.org). Hosting the bot itself is orthogonal, pair
// with deploy-workers / deploy-fly.
interface Config {
  botUsername: string;               // e.g. 'my_sh1pt_bot' (no @)
  webhookUrl: string;                // where Telegram will POST updates
  commands?: { command: string; description: string }[];
  description?: string;
  shortDescription?: string;
  tokenKey?: string;                 // defaults to TELEGRAM_BOT_TOKEN
  webhookSecretKey?: string;         // optional secret_token value for setWebhook
  directoryListings?: ('storebot.me' | 'combot.org')[];
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

type TelegramCommand = { command: string; description: string };

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`chat-telegram requires ${field}`);
  return trimmed;
}

function optionalValue(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireValue(value, field);
}

function httpsUrl(value: string | undefined, field: string): string {
  const url = requireValue(value, field);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`chat-telegram ${field} must be an https URL`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`chat-telegram ${field} must be an https URL`);
  return url;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    botUsername: normalizeUsername(config.botUsername),
    webhookUrl: httpsUrl(config.webhookUrl, 'webhookUrl'),
    commands: normalizeCommands(config.commands),
    description: optionalValue(config.description, 'description'),
    shortDescription: optionalValue(config.shortDescription, 'shortDescription'),
    tokenKey: optionalValue(config.tokenKey, 'tokenKey'),
    webhookSecretKey: optionalValue(config.webhookSecretKey, 'webhookSecretKey'),
    directoryListings: directoryListings(config.directoryListings),
  };
}

function manifestFor(config: Config, version: string) {
  config = normalizedConfig(config);
  return {
    provider: 'telegram',
    botUsername: config.botUsername,
    version,
    webhookUrl: config.webhookUrl,
    commands: config.commands ?? [],
    description: config.description,
    shortDescription: config.shortDescription,
    directoryListings: config.directoryListings ?? [],
    botUrl: `https://t.me/${config.botUsername}`,
  };
}

export default defineTarget<Config>({
  id: 'chat-telegram',
  kind: 'chat',
  label: 'Telegram Bot',
  async build(ctx, config) {
    const manifest = manifestFor(config, ctx.version);
    const username = manifest.botUsername;
    ctx.log(`telegram prepare bot manifest for @${username}`);
    const artifact = join(ctx.outDir, `telegram-${safeFilename(username)}.json`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(artifact, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    return { artifact, meta: { botUrl: manifest.botUrl, commands: manifest.commands.length } };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
    const username = config.botUsername;
    ctx.log(`telegram setWebhook + setMyCommands for @${username}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: manifestFor(config, ctx.version) };

    const tokenKey = config.tokenKey ?? 'TELEGRAM_BOT_TOKEN';
    const token = ctx.secret(tokenKey);
    if (!token) throw new Error(`${tokenKey} not in vault - run: sh1pt secret set ${tokenKey} <bot-token>`);

    await callTelegram(ctx.log, token, 'setWebhook', {
      url: config.webhookUrl,
      ...(config.webhookSecretKey ? { secret_token: requireSecret(ctx, config.webhookSecretKey) } : {}),
    });

    if (config.commands?.length) {
      await callTelegram(ctx.log, token, 'setMyCommands', {
        commands: config.commands,
      });
    }

    if (config.description) {
      await callTelegram(ctx.log, token, 'setMyDescription', { description: config.description });
    }

    if (config.shortDescription) {
      await callTelegram(ctx.log, token, 'setMyShortDescription', { short_description: config.shortDescription });
    }

    return { id: `@${username}@${ctx.version}`, url: `https://t.me/${username}` };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: "Telegram Bot (@BotFather)",
    vendorDocUrl: "https://t.me/BotFather",
    steps: [
      "Open Telegram -> chat with @BotFather -> /newbot",
      "Copy the HTTP API token - sh1pt will store it",
      "Run: sh1pt secret set TELEGRAM_BOT_TOKEN <token>",
    ],
  }),
});

async function callTelegram<T>(
  log: (msg: string, level?: 'info' | 'warn' | 'error') => void,
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T | undefined> {
  log(`telegram ${method}`);
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json() as TelegramResponse<T>;
  if (!res.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram ${method} failed (${res.status})`);
  }
  return data.result;
}

function normalizeUsername(username: string): string {
  const clean = requireValue(username, 'botUsername').replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(clean) || !/bot$/i.test(clean)) {
    throw new Error('chat-telegram botUsername must be 5-32 characters, use letters/numbers/underscores, and end with bot');
  }
  return clean;
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function normalizeCommand(command: TelegramCommand): TelegramCommand {
  const name = requireValue(command.command, 'command').replace(/^\//, '');
  if (!/^[a-z0-9_]{1,32}$/.test(name)) {
    throw new Error('chat-telegram command must contain 1-32 lowercase letters, numbers, or underscores');
  }
  const description = requireValue(command.description, `command ${name} description`);
  if (description.length > 256) throw new Error(`chat-telegram command ${name} description must be 256 characters or fewer`);
  return {
    command: name,
    description,
  };
}

function normalizeCommands(commands: Config['commands']): TelegramCommand[] {
  return (commands ?? []).map(normalizeCommand);
}

function directoryListings(values: Config['directoryListings']): Config['directoryListings'] {
  const listings = values ?? [];
  for (const listing of listings) {
    if (listing !== 'storebot.me' && listing !== 'combot.org') {
      throw new Error('chat-telegram directoryListings must be storebot.me or combot.org');
    }
  }
  return listings;
}

function requireSecret(ctx: { secret(key: string): string | undefined }, key: string): string {
  const value = ctx.secret(key);
  if (!value) throw new Error(`${key} not in vault - run: sh1pt secret set ${key} <value>`);
  return value;
}
