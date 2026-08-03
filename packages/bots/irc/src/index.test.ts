import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import type { BotHandler } from '@profullstack/sh1pt-core';
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { server: 'irc.libera.chat', nick: 'sh1ptbot', channels: ['#sh1pt'] }, sampleChannel: '#sh1pt' });

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('bot-irc config validation', () => {
  it('rejects empty server hostname', async () => {
    await expect(bot.register(ctx(), [handler()], { server: '', nick: 'bot', channels: ['#test'] }))
      .rejects.toThrow('IRC server hostname must not be empty');
  });

  it('rejects whitespace-only server hostname', async () => {
    await expect(bot.register(ctx(), [handler()], { server: '  ', nick: 'bot', channels: ['#test'] }))
      .rejects.toThrow('IRC server hostname must not be empty');
  });

  it('rejects out-of-range port numbers', async () => {
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'bot', channels: ['#test'], port: 0 }))
      .rejects.toThrow('IRC port must be an integer between 1 and 65535');
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'bot', channels: ['#test'], port: 70000 }))
      .rejects.toThrow('IRC port must be an integer between 1 and 65535');
  });

  it('rejects non-integer port values', async () => {
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'bot', channels: ['#test'], port: 6667.5 }))
      .rejects.toThrow('IRC port must be an integer between 1 and 65535');
  });

  it('rejects invalid IRC nicknames', async () => {
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: '', channels: ['#test'] }))
      .rejects.toThrow('is not a valid RFC 2812 nickname');
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'bot name', channels: ['#test'] }))
      .rejects.toThrow('is not a valid RFC 2812 nickname');
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: '123', channels: ['#test'] }))
      .rejects.toThrow('is not a valid RFC 2812 nickname');
  });

  it('rejects valid but too-long nicknames', async () => {
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'a'.repeat(10), channels: ['#test'] }))
      .rejects.toThrow('is not a valid RFC 2812 nickname');
  });

  it('rejects invalid channel prefixes', async () => {
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'bot', channels: ['test'] }))
      .rejects.toThrow('must start with one of: # & + !');
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'bot', channels: ['@channel'] }))
      .rejects.toThrow('must start with one of: # & + !');
  });

  it('rejects empty channel names', async () => {
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'bot', channels: [''] }))
      .rejects.toThrow('IRC channel name must be a non-empty string');
  });

  it('rejects non-array channels', async () => {
    await expect(bot.register(ctx(), [handler()], { server: 'irc.test', nick: 'bot', channels: '#test' as unknown as string[] }))
      .rejects.toThrow('IRC channels must be an array of channel names');
  });

  it('accepts valid IRC configurations', async () => {
    const seen: string[] = [];
    const server = await fakeIrcServer((socket) => {
      socket.on('data', (chunk) => seen.push(...lines(chunk)));
    });
    const handle = await bot.register(ctx(), [handler()], {
      server: '127.0.0.1',
      port: addressPort(server),
      nick: 'test-bot',
      username: 'test',
      channels: ['#test', '&local'],
    });
    try {
      await waitFor(() => seen.some((line) => line.startsWith('NICK')));
      expect(seen).toEqual(expect.arrayContaining(['NICK test-bot']));
    } finally {
      await handle.close();
    }
  });

  it('validates config on send as well', async () => {
    await expect(bot.send(ctx(), '#chan', { text: 'hi' }, { server: '', nick: 'bot', channels: [] }))
      .rejects.toThrow('IRC server hostname must not be empty');
  });
});

describe('bot-irc live socket behavior', () => {
  it('registers, joins channels, dispatches messages, and replies to handlers', async () => {
    const seen: string[] = [];
    let client: Socket | undefined;
    const server = await fakeIrcServer((socket) => {
      client = socket;
      socket.on('data', (chunk) => seen.push(...lines(chunk)));
    });

    let resolveReceived!: (value: string) => void;
    const received = new Promise<string>((resolve) => {
      resolveReceived = resolve;
    });
    const handlers: BotHandler[] = [{
      match: { type: 'command' as const, command: 'ping' },
      handle: (_ctx, event) => {
        resolveReceived(JSON.stringify({
          type: event.type,
          channel: event.channel,
          command: event.command,
          args: event.args,
          user: event.user.username,
        }));
        return { text: 'pong' };
      },
    }];
    const handle = await bot.register(ctx(), handlers, {
      server: '127.0.0.1',
      port: addressPort(server),
      nick: 'sh1ptbot',
      username: 'sh1pt',
      channels: ['#sh1pt'],
      password: 'server-password',
      nickservPassword: 'nickserv-password',
    });

    try {
      await waitFor(() => seen.some((line) => line === 'JOIN #sh1pt'));
      client?.write(':irc.example PING :12345\r\n');
      client?.write(':alice!u@example PRIVMSG #sh1pt :!ping one two\r\n');

      await expect(received).resolves.toBe(JSON.stringify({
        type: 'command',
        channel: '#sh1pt',
        command: 'ping',
        args: ['one', 'two'],
        user: 'alice',
      }));
      await waitFor(() => seen.some((line) => line === 'PRIVMSG #sh1pt :pong'));

      expect(seen).toEqual(expect.arrayContaining([
        'PASS server-password',
        'NICK sh1ptbot',
        'USER sh1pt 0 * :sh1ptbot',
        'PRIVMSG NickServ :IDENTIFY nickserv-password',
        'JOIN #sh1pt',
        'PONG :12345',
        'PRIVMSG #sh1pt :pong',
      ]));
    } finally {
      await handle.close();
    }
  });

  it('opens a short-lived connection for proactive sends', async () => {
    const seen: string[] = [];
    const server = await fakeIrcServer((socket) => {
      socket.on('data', (chunk) => seen.push(...lines(chunk)));
    });

    const result = await bot.send(ctx(), '#ops', { text: 'hello\nworld' }, {
      server: '127.0.0.1',
      port: addressPort(server),
      nick: 'sender',
      channels: [],
    });

    expect(result.id).toMatch(/^i_/);
    await waitFor(() => seen.some((line) => line === 'PRIVMSG #ops :hello world'));
    expect(seen).toEqual(expect.arrayContaining([
      'NICK sender',
      'USER sender 0 * :sender',
      'PRIVMSG #ops :hello world',
      'QUIT :sh1pt bot closing',
    ]));
  });
});

function ctx() {
  return {
    dryRun: false,
    log: () => {},
    secret: () => undefined,
  };
}

function handler(): BotHandler {
  return {
    match: { type: 'message' as const },
    handle: () => undefined,
  };
}

async function fakeIrcServer(onClient: (socket: Socket) => void): Promise<Server> {
  const server = createServer(onClient);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  servers.push(server);
  return server;
}

function addressPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');
  return address.port;
}

function lines(chunk: Buffer | string): string[] {
  return String(chunk).split(/\r?\n/).filter(Boolean);
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for assertion');
}
