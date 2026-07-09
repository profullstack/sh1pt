import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Slack apps — bots, slash commands, workflows, Block Kit surfaces.
// Two distribution tiers:
//   'workspace': installable in one workspace only (no review)
//   'directory': listed in Slack App Directory (full review, 1-2 weeks)
interface Config {
  appId: string;
  clientId: string;
  distribution: 'workspace' | 'directory';
  requestUrl: string;                // events + interactivity endpoint
  name?: string;
  description?: string;
  botDisplayName?: string;
  botEvents?: string[];
  slashCommands?: { command: string; url: string; description: string }[];
  scopes: { bot?: string[]; user?: string[] };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`chat-slack requires ${field}`);
  return trimmed;
}

function optionalValue(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireValue(value, field);
}

function appId(value: string | undefined): string {
  const id = requireValue(value, 'appId');
  if (!/^A[A-Z0-9]+$/.test(id)) throw new Error('chat-slack appId must look like a Slack app ID');
  return id;
}

function clientId(value: string | undefined): string {
  const id = requireValue(value, 'clientId');
  if (!/^\d+(\.\d+)?$/.test(id)) throw new Error('chat-slack clientId must look like a Slack client ID');
  return id;
}

function httpsUrl(value: string | undefined, field: string): string {
  const url = requireValue(value, field);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`chat-slack ${field} must be an https URL`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`chat-slack ${field} must be an https URL`);
  return url;
}

function distribution(value: Config['distribution'] | undefined): Config['distribution'] {
  if (value !== 'workspace' && value !== 'directory') {
    throw new Error('chat-slack distribution must be workspace or directory');
  }
  return value;
}

function scopes(scopes: Config['scopes'] | undefined): Config['scopes'] {
  if (!scopes) throw new Error('chat-slack requires scopes');
  const bot = scopes.bot ?? [];
  const user = scopes.user ?? [];
  if (!bot.length && !user.length) throw new Error('chat-slack requires at least one bot or user scope');
  for (const scope of [...bot, ...user]) {
    if (!scope.trim() || /\s/.test(scope)) throw new Error('chat-slack scopes must not be blank or contain whitespace');
  }
  return { bot, user };
}

function slashCommands(commands: Config['slashCommands']): Config['slashCommands'] {
  return (commands ?? []).map((command) => {
    const name = requireValue(command.command, 'slash command');
    if (!/^\/[a-z0-9_-]{1,32}$/.test(name)) {
      throw new Error('chat-slack slash command must start with / and contain 1-32 lowercase letters, numbers, underscores, or hyphens');
    }
    return {
      command: name,
      url: httpsUrl(command.url, `slash command ${name} url`),
      description: requireValue(command.description, `slash command ${name} description`),
    };
  });
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    appId: appId(config.appId),
    clientId: clientId(config.clientId),
    distribution: distribution(config.distribution),
    requestUrl: httpsUrl(config.requestUrl, 'requestUrl'),
    name: optionalValue(config.name, 'name'),
    description: optionalValue(config.description, 'description'),
    botDisplayName: optionalValue(config.botDisplayName, 'botDisplayName'),
    botEvents: config.botEvents ?? [],
    slashCommands: slashCommands(config.slashCommands),
    scopes: scopes(config.scopes),
  };
}

function renderList(values: string[], indent: string): string[] {
  return values.map((value) => `${indent}- ${yamlString(value)}`);
}

function renderSlashCommands(commands: NonNullable<Config['slashCommands']>): string[] {
  return commands.flatMap((command) => [
    '    - command: ' + yamlString(command.command),
    '      url: ' + yamlString(command.url),
    '      description: ' + yamlString(command.description),
  ]);
}

function renderSlackManifest(config: Config): string {
  config = normalizedConfig(config);
  const appName = config.name ?? config.appId;
  const botDisplayName = config.botDisplayName ?? appName;
  const botScopes = config.scopes.bot ?? [];
  const userScopes = config.scopes.user ?? [];
  const botEvents = config.botEvents ?? [];
  const lines = [
    'display_information:',
    `  name: ${yamlString(appName)}`,
  ];

  if (config.description) {
    lines.push(`  description: ${yamlString(config.description)}`);
  }

  lines.push('features:');
  lines.push('  bot_user:');
  lines.push(`    display_name: ${yamlString(botDisplayName)}`);
  lines.push('    always_online: false');

  if (config.slashCommands?.length) {
    lines.push('  slash_commands:');
    lines.push(...renderSlashCommands(config.slashCommands));
  }

  lines.push('oauth_config:');
  lines.push(`  client_id: ${yamlString(config.clientId)}`);
  lines.push('  scopes:');

  if (botScopes.length) {
    lines.push('    bot:');
    lines.push(...renderList(botScopes, '      '));
  }

  if (userScopes.length) {
    lines.push('    user:');
    lines.push(...renderList(userScopes, '      '));
  }

  lines.push('settings:');
  lines.push('  event_subscriptions:');
  lines.push(`    request_url: ${yamlString(config.requestUrl)}`);

  if (botEvents.length) {
    lines.push('    bot_events:');
    lines.push(...renderList(botEvents, '      '));
  }

  lines.push('  interactivity:');
  lines.push('    is_enabled: true');
  lines.push(`    request_url: ${yamlString(config.requestUrl)}`);
  lines.push(`  org_deploy_enabled: ${config.distribution === 'directory' ? 'true' : 'false'}`);
  lines.push('  socket_mode_enabled: false');
  lines.push('  token_rotation_enabled: false');
  lines.push('');
  return lines.join('\n');
}

export default defineTarget<Config>({
  id: 'chat-slack',
  kind: 'chat',
  label: 'Slack App Directory',
  async build(ctx, config) {
    config = normalizedConfig(config);
    const manifestPath = join(ctx.outDir, 'slack-manifest.yaml');
    ctx.log(`render slack app manifest · appId=${config.appId}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(manifestPath, renderSlackManifest(config), 'utf-8');
    return { artifact: manifestPath };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
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
