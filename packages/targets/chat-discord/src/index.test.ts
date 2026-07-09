import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'chat', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Discord chat target', () => {
  it('writes a Discord command manifest with invite metadata', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-discord-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      applicationId: '123456',
      distribution: 'public',
      interactionsEndpointUrl: 'https://bot.example.com/interactions',
      permissions: 2048,
      slashCommands: [
        { name: '/status', description: 'Show deployment status' },
      ],
    });

    expect(result.artifact).toBe(join(outDir, 'discord-commands.json'));
    expect(result.meta).toEqual({
      inviteUrl: 'https://discord.com/oauth2/authorize?client_id=123456&scope=bot+applications.commands&permissions=2048',
      commands: 1,
    });

    const manifest = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(manifest).toMatchObject({
      provider: 'discord',
      applicationId: '123456',
      version: '1.2.3',
      distribution: 'public',
      interactionsEndpointUrl: 'https://bot.example.com/interactions',
      scopes: ['bot', 'applications.commands'],
      permissions: 2048,
      inviteUrl: 'https://discord.com/oauth2/authorize?client_id=123456&scope=bot+applications.commands&permissions=2048',
      commands: [
        { name: 'status', description: 'Show deployment status' },
      ],
      directoryReviewRequired: false,
    });
  });

  it('keeps dry-run shipping side-effect free', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      applicationId: '123456',
      distribution: 'directory',
      scopes: ['applications.commands'],
      slashCommands: [
        { name: 'ship', description: 'Ship the current release' },
      ],
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        distribution: 'directory',
        scopes: ['applications.commands'],
        directoryReviewRequired: true,
        commands: [
          { name: 'ship', description: 'Ship the current release' },
        ],
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a Discord app token before real shipping', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: false,
    }) as any, {
      applicationId: '123456',
      distribution: 'private',
    })).rejects.toThrow('DISCORD_APP_TOKEN not in vault');
  });

  it('rejects invalid Discord config before API calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.build(fakeBuildContext() as any, {
      applicationId: 'app-id',
      distribution: 'public',
    })).rejects.toThrow('applicationId must contain only digits');

    await expect(adapter.build(fakeBuildContext() as any, {
      applicationId: '123456',
      distribution: 'beta',
    } as any)).rejects.toThrow('distribution must be private, public, or directory');

    await expect(adapter.ship(fakeShipContext({ dryRun: false }) as any, {
      applicationId: '123456',
      distribution: 'private',
      interactionsEndpointUrl: 'http://bot.example.com/interactions',
    })).rejects.toThrow('interactionsEndpointUrl must be an https URL');

    await expect(adapter.ship(fakeShipContext({ dryRun: false }) as any, {
      applicationId: '123456',
      distribution: 'private',
      scopes: ['email'],
    } as any)).rejects.toThrow('scopes must be bot or applications.commands');

    await expect(adapter.build(fakeBuildContext() as any, {
      applicationId: '123456',
      distribution: 'private',
      permissions: -1,
    })).rejects.toThrow('permissions must be a non-negative integer');

    await expect(adapter.ship(fakeShipContext({ dryRun: false }) as any, {
      applicationId: '123456',
      distribution: 'private',
      slashCommands: [
        { name: '/bad name', description: 'Deploy the app' },
      ],
    })).rejects.toThrow('slash command name must be 1-32 lowercase');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('patches the application and overwrites global slash commands', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"id":"123456"}' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '[{"id":"cmd"}]' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
      secret: (key: string) => ({ DISCORD_APP_TOKEN: 'discord-token' }[key]),
    }) as any, {
      applicationId: '123456',
      distribution: 'public',
      interactionsEndpointUrl: 'https://bot.example.com/interactions',
      permissions: 8,
      slashCommands: [
        { name: '/deploy', description: 'Deploy the app', options: [{ name: 'target' }] },
      ],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://discord.com/api/v10/applications/123456', {
      method: 'PATCH',
      headers: {
        authorization: 'Bot discord-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interactions_endpoint_url: 'https://bot.example.com/interactions',
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://discord.com/api/v10/applications/123456/commands', {
      method: 'PUT',
      headers: {
        authorization: 'Bot discord-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        { name: 'deploy', description: 'Deploy the app', options: [{ name: 'target' }] },
      ]),
    });
    expect(result).toEqual({
      id: '123456@1.2.3',
      url: 'https://discord.com/developers/applications/123456',
      meta: {
        inviteUrl: 'https://discord.com/oauth2/authorize?client_id=123456&scope=bot+applications.commands&permissions=8',
        commands: 1,
        directoryReviewRequired: false,
      },
    });
  });

  it('surfaces Discord API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"message":"401: Unauthorized"}',
    }));

    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
      secret: (key: string) => ({ DISCORD_APP_TOKEN: 'bad-token' }[key]),
    }) as any, {
      applicationId: '123456',
      distribution: 'private',
    })).rejects.toThrow('401: Unauthorized');
  });
});
