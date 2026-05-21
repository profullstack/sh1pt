import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import { Duplex } from 'node:stream';
import { describe, expect, it } from 'vitest';
import bot from './index.js';
import type { BotCtx, BotEvent, BotHandler } from '@profullstack/sh1pt-core';
import type { TwitchConnectionFactory } from './index.js';

contractTestBot(bot, { sampleConfig: { channel: 'sh1pt' }, sampleChannel: 'sh1pt' });

class FakeIrcSocket extends Duplex {
  readonly writes: string[] = [];

  _read(): void {}

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.writes.push(chunk.toString('utf8'));
    callback();
  }

  pushServer(line: string): void {
    this.push(line);
  }

  text(): string {
    return this.writes.join('');
  }
}

function factoryFor(socket: FakeIrcSocket): TwitchConnectionFactory {
  return (_options, onConnect) => {
    process.nextTick(onConnect);
    return socket as any;
  };
}

function ctx(): BotCtx {
  return {
    secret(key) {
      if (key === 'TWITCH_OAUTH_TOKEN') return 'unit-oauth-token';
      if (key === 'TWITCH_BOT_USERNAME') return 'unitbot';
      return undefined;
    },
    log() {},
    dryRun: false,
  };
}

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('Twitch IRC adapter', () => {
  it('sends a proactive chat message over authenticated IRC', async () => {
    const socket = new FakeIrcSocket();

    const result = await bot.send(
      ctx(),
      'Sh1pt',
      { text: 'Hello\r\nthere' },
      { channel: 'sh1pt', connectionFactory: factoryFor(socket) },
    );

    expect(result.id).toMatch(/^tw_/);
    expect(socket.text()).toContain('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
    expect(socket.text()).toContain('PASS oauth:unit-oauth-token\r\n');
    expect(socket.text()).toContain('NICK unitbot\r\n');
    expect(socket.text()).toContain('JOIN #sh1pt\r\n');
    expect(socket.text()).toContain('PRIVMSG #sh1pt :Hello there\r\n');
  });

  it('dispatches bang-prefixed PRIVMSG lines as commands and replies in-channel', async () => {
    const socket = new FakeIrcSocket();
    const seen: BotEvent[] = [];
    const handler: BotHandler = {
      match: { type: 'command', command: 'ping' },
      async handle(_ctx, event) {
        seen.push(event);
        return { text: `pong ${event.args?.join(' ')}` };
      },
    };

    const closeable = await bot.register(
      ctx(),
      [handler],
      { channel: 'sh1pt', connectionFactory: factoryFor(socket) },
    );

    socket.pushServer(
      '@display-name=Viewer;id=msg-1;tmi-sent-ts=1700000000000;user-id=user-1 ' +
        ':viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #sh1pt :!ping alpha beta\r\n',
    );
    await nextTick();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: 'command',
      channel: 'sh1pt',
      text: '!ping alpha beta',
      command: 'ping',
      args: ['alpha', 'beta'],
      replyToId: 'msg-1',
      user: {
        id: 'user-1',
        username: 'viewer',
        displayName: 'Viewer',
      },
      timestamp: '2023-11-14T22:13:20.000Z',
    });
    expect(socket.text()).toContain('@reply-parent-msg-id=msg-1 PRIVMSG #sh1pt :pong alpha beta\r\n');

    await closeable.close();
  });

  it('answers Twitch keepalive PING messages with matching PONG messages', async () => {
    const socket = new FakeIrcSocket();
    const closeable = await bot.register(
      ctx(),
      [],
      { channel: 'sh1pt', connectionFactory: factoryFor(socket) },
    );

    socket.pushServer('PING :tmi.twitch.tv\r\n');
    await nextTick();

    expect(socket.text()).toContain('PONG :tmi.twitch.tv\r\n');
    await closeable.close();
  });
});
