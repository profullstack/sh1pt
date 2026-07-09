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

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`chat-discord requires ${field}`);
  return trimmed;
}

function optionalValue(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireValue(value, field);
}

function requireApplicationId(config: Config): string {
  const applicationId = requireValue(config.applicationId, 'applicationId');
  if (!/^\d+$/.test(applicationId)) throw new Error('chat-discord applicationId must contain only digits');
  return applicationId;
}

function distribution(value: Config['distribution'] | undefined): Config['distribution'] {
  if (value !== 'private' && value !== 'public' && value !== 'directory') {
    throw new Error('chat-discord distribution must be private, public, or directory');
  }
  return value;
}

function interactionsEndpointUrl(value: string | undefined): string | undefined {
  const endpoint = optionalValue(value, 'interactionsEndpointUrl');
  if (endpoint === undefined) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('chat-discord interactionsEndpointUrl must be an https URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('chat-discord interactionsEndpointUrl must be an https URL');
  return endpoint;
}

function normalizeCommands(commands: Config['slashCommands']): DiscordCommand[] {
  return (commands ?? []).map((command) => {
    const name = requireValue(command.name, 'slash command name').replace(/^\//, '').trim().toLowerCase();
    if (!name) throw new Error('chat-discord slash command name is required');
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
      throw new Error('chat-discord slash command name must be 1-32 lowercase letters, numbers, underscores, or hyphens');
    }
    const description = requireValue(command.description, `slash command "${name}" description`);
    if (description.length > 100) throw new Error(`chat-discord slash command "${name}" description must be 100 characters or fewer`);

    return {
      name,
      description,
      ...(command.options ? { options: command.options } : {}),
    };
  });
}

function scopesFor(config: Config): string[] {
  const scopes = config.scopes?.length ? config.scopes : ['bot', 'applications.commands'];
  for (const scope of scopes) {
    if (scope !== 'bot' && scope !== 'applications.commands') {
      throw new Error('chat-discord scopes must be bot or applications.commands');
    }
  }
  return scopes;
}

function permissionsFor(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) throw new Error('chat-discord permissions must be a non-negative integer');
  return value;
}

function inviteUrl(config: Config): string {
  const query = new URLSearchParams({
    client_id: requireApplicationId(config),
    scope: scopesFor(config).join(' '),
    permissions: String(permissionsFor(config.permissions)),
  });
  return `https://discord.com/oauth2/authorize?${query.toString()}`;
}

function manifestFor(config: Config, version: string) {
  const commands = normalizeCommands(config.slashCommands);
  const distro = distribution(config.distribution);
  const endpoint = interactionsEndpointUrl(config.interactionsEndpointUrl);
  const scopes = scopesFor(config);
  const permissions = permissionsFor(config.permissions);
  return {
    provider: 'discord',
    applicationId: requireApplicationId(config),
    version,
    distribution: distro,
    interactionsEndpointUrl: endpoint,
    scopes,
    permissions,
    inviteUrl: inviteUrl(config),
    commands,
    directoryReviewRequired: distro === 'directory',
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

    const tokenKey = optionalValue(config.tokenKey, 'tokenKey') ?? 'DISCORD_APP_TOKEN';
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
