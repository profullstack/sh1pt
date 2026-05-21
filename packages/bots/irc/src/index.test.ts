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
