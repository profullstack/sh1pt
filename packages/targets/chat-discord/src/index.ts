import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Discord apps — bots, slash commands, message components, modals.
// Distribution surfaces:
//   'private':   use in one server only, no directory listing
//   'public':    invite link anywhere (needs verification if >75 servers)
//   'directory': App Directory listing (review required, public only)
interface Config {
  applicationId: string;
  distribution: 'private' | 'public' | 'directory';
  interactionsEndpointUrl?: string;      // HTTP interactions target (alternative to gateway)
  tokenKey?: string;                     // defaults to DISCORD_APP_TOKEN
  slashCommands?: {
    name: string;
    description: string;
    options?: unknown[];                 // Discord's ApplicationCommandOption shape
  }[];
  scopes?: ('bot' | 'applications.commands')[];
  permissions?: number;                  // bitfield
}

interface DiscordCommand {
  name: string;
  description: string;
  options?: unknown[];
}

function requireApplicationId(config: Config): string {
  const applicationId = config.applicationId?.trim();
  if (!applicationId) throw new Error('chat-discord requires applicationId');
  return applicationId;
}

function normalizeCommands(commands: Config['slashCommands']): DiscordCommand[] {
  return (commands ?? []).map((command) => {
    const name = command.name.replace(/^\//, '').trim().toLowerCase();
    if (!name) throw new Error('chat-discord slash command name is required');
    const description = command.description.trim();
    if (!description) throw new Error(`chat-discord slash command "${name}" requires description`);

    return {
      name,
      description,
      ...(command.options ? { options: command.options } : {}),
    };
  });
}

function scopesFor(config: Config): string[] {
  return config.scopes?.length ? config.scopes : ['bot', 'applications.commands'];
}

function inviteUrl(config: Config): string {
  const query = new URLSearchParams({
    client_id: requireApplicationId(config),
    scope: scopesFor(config).join(' '),
    permissions: String(config.permissions ?? 0),
  });
  return `https://discord.com/oauth2/authorize?${query.toString()}`;
}

function manifestFor(config: Config, version: string) {
  const commands = normalizeCommands(config.slashCommands);
  return {
    provider: 'discord',
    applicationId: requireApplicationId(config),
    version,
    distribution: config.distribution,
    interactionsEndpointUrl: config.interactionsEndpointUrl,
    scopes: scopesFor(config),
    permissions: config.permissions ?? 0,
    inviteUrl: inviteUrl(config),
    commands,
    directoryReviewRequired: config.distribution === 'directory',
  };
}

async function callDiscord<T>(
  token: string,
  method: 'PATCH' | 'PUT',
  path: string,
  body: Record<string, unknown> | DiscordCommand[],
): Promise<T | undefined> {
  if (typeof fetch !== 'function') throw new Error('global fetch is not available for Discord API calls');

  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      authorization: `Bot ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) as { message?: string } & T : undefined;
  if (!res.ok) {
    const message = data && 'message' in data ? data.message : undefined;
    throw new Error(message ?? `Discord ${method} ${path} failed (${res.status})`);
  }
  return data as T | undefined;
}

export default defineTarget<Config>({
  id: 'chat-discord',
  kind: 'chat',
  label: 'Discord App Directory',
  async build(ctx, config) {
    const manifest = manifestFor(config, ctx.version);
    const artifact = join(ctx.outDir, 'discord-commands.json');
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(artifact, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    ctx.log(`rendered discord command manifest · ${manifest.commands.length} commands`);
    return { artifact, meta: { inviteUrl: manifest.inviteUrl, commands: manifest.commands.length } };
  },
  async ship(ctx, config) {
    const manifest = manifestFor(config, ctx.version);
    ctx.log(`discord · bulk overwrite ${manifest.commands.length} commands${manifest.interactionsEndpointUrl ? ' + update interactions endpoint' : ''}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: manifest };

    const tokenKey = config.tokenKey ?? 'DISCORD_APP_TOKEN';
    const token = ctx.secret(tokenKey);
    if (!token) throw new Error(`${tokenKey} not in vault — run: sh1pt secret set ${tokenKey} <bot-token>`);

    if (manifest.interactionsEndpointUrl) {
      await callDiscord(token, 'PATCH', `/applications/${manifest.applicationId}`, {
        interactions_endpoint_url: manifest.interactionsEndpointUrl,
      });
    }

    await callDiscord(token, 'PUT', `/applications/${manifest.applicationId}/commands`, manifest.commands);

    return {
      id: `${manifest.applicationId}@${ctx.version}`,
      url: `https://discord.com/developers/applications/${manifest.applicationId}`,
      meta: {
        inviteUrl: manifest.inviteUrl,
        commands: manifest.commands.length,
        directoryReviewRequired: manifest.directoryReviewRequired,
      },
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
