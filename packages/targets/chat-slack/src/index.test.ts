import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'chat', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Slack app manifest generation', () => {
  it('writes a Slack manifest from app config', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-slack-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir }) as any, {
      appId: 'A123456',
      clientId: '123.456',
      distribution: 'directory',
      requestUrl: 'https://example.com/slack/events',
      name: 'Ship Bot',
      description: 'Release assistant for Slack',
      botDisplayName: 'shipbot',
      botEvents: ['app_mention', 'message.im'],
      slashCommands: [
        {
          command: '/ship',
          url: 'https://example.com/slack/commands',
          description: 'Trigger a release workflow',
        },
      ],
      scopes: {
        bot: ['commands', 'chat:write'],
        user: ['users:read'],
      },
    });

    expect(result.artifact).toBe(join(outDir, 'slack-manifest.yaml'));
    const manifest = await readFile(result.artifact, 'utf-8');

    expect(manifest).toContain('display_information:');
    expect(manifest).toContain('  name: "Ship Bot"');
    expect(manifest).toContain('  description: "Release assistant for Slack"');
    expect(manifest).toContain('oauth_config:');
    expect(manifest).toContain('  client_id: "123.456"');
    expect(manifest).toContain('      - "commands"');
    expect(manifest).toContain('      - "users:read"');
    expect(manifest).toContain('  slash_commands:');
    expect(manifest).toContain('    - command: "/ship"');
    expect(manifest).toContain('      url: "https://example.com/slack/commands"');
    expect(manifest).toContain('    request_url: "https://example.com/slack/events"');
    expect(manifest).toContain('      - "app_mention"');
    expect(manifest).toContain('  org_deploy_enabled: true');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      appId: 'A123456',
      clientId: '123.456',
      distribution: 'workspace',
      requestUrl: 'https://example.com/slack/events',
      scopes: { bot: ['chat:write'] },
    })).resolves.toEqual({ id: 'dry-run' });
  });

  it('rejects invalid Slack config before rendering or shipping', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      appId: 'not-an-app',
      clientId: '123.456',
      distribution: 'workspace',
      requestUrl: 'https://example.com/slack/events',
      scopes: { bot: ['chat:write'] },
    })).rejects.toThrow('appId must look like a Slack app ID');

    await expect(adapter.build(fakeBuildContext() as any, {
      appId: 'A123456',
      clientId: 'client-id',
      distribution: 'workspace',
      requestUrl: 'https://example.com/slack/events',
      scopes: { bot: ['chat:write'] },
    })).rejects.toThrow('clientId must look like a Slack client ID');

    await expect(adapter.build(fakeBuildContext() as any, {
      appId: 'A123456',
      clientId: '123.456',
      distribution: 'global',
      requestUrl: 'https://example.com/slack/events',
      scopes: { bot: ['chat:write'] },
    } as any)).rejects.toThrow('distribution must be workspace or directory');

    await expect(adapter.ship(fakeShipContext({ dryRun: true }) as any, {
      appId: 'A123456',
      clientId: '123.456',
      distribution: 'workspace',
      requestUrl: 'http://example.com/slack/events',
      scopes: { bot: ['chat:write'] },
    })).rejects.toThrow('requestUrl must be an https URL');

    await expect(adapter.build(fakeBuildContext() as any, {
      appId: 'A123456',
      clientId: '123.456',
      distribution: 'workspace',
      requestUrl: 'https://example.com/slack/events',
      scopes: {},
    })).rejects.toThrow('requires at least one bot or user scope');

    await expect(adapter.build(fakeBuildContext() as any, {
      appId: 'A123456',
      clientId: '123.456',
      distribution: 'workspace',
      requestUrl: 'https://example.com/slack/events',
      slashCommands: [
        { command: 'ship', url: 'https://example.com/slack/commands', description: 'Ship it' },
      ],
      scopes: { bot: ['chat:write'] },
    })).rejects.toThrow('slash command must start with /');
  });
});
