import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestBridge } from '@profullstack/sh1pt-core/testing';

class FakeSocket extends EventEmitter {
  writes: string[] = [];
  end = vi.fn();
  destroy = vi.fn();

  write(data: string | Uint8Array): boolean {
    this.writes.push(data.toString());
    return true;
  }
}

const sockets = {
  net: [] as FakeSocket[],
  tls: [] as FakeSocket[],
};

vi.mock('node:net', () => ({
  createConnection: vi.fn(() => {
    const socket = new FakeSocket();
    sockets.net.push(socket);
    return socket;
  }),
}));

vi.mock('node:tls', () => ({
  connect: vi.fn(() => {
    const socket = new FakeSocket();
    sockets.tls.push(socket);
    return socket;
  }),
}));

const { default: adapter } = await import('./index.js');

contractTestBridge(adapter, {
  sampleConfig: { server: 'irc.example.net', nick: 'sh1pt' },
  sampleChannel: '#ship',
});

afterEach(() => {
  sockets.net.length = 0;
  sockets.tls.length = 0;
  vi.clearAllMocks();
});

describe('bridge-irc socket integration', () => {
  it('registers and sends PRIVMSG lines over TLS', async () => {
    const result = await adapter.send(ctx({}), '#ship', {
      id: 'src-1',
      channel: 'src',
      identity: { network: 'discord', username: 'alice' },
      text: 'release shipped',
      attachments: [{ kind: 'file', url: 'https://example.com/log.txt', filename: 'log.txt' }],
      timestamp: '2026-05-21T00:00:00.000Z',
      originalNetwork: 'discord',
    }, {
      server: 'irc.example.net',
      nick: 'sh1pt',
    });

    expect(result.id).toMatch(/^irc_/);
    expect(sockets.tls).toHaveLength(1);
    const socket = sockets.tls[0]!;
    socket.emit('connect');

    expect(socket.writes).toEqual([
      'NICK sh1pt\r\n',
      'USER sh1pt 0 * :sh1pt\r\n',
      'PRIVMSG #ship :alice [discord]: release shipped file: https://example.com/log.txt\r\n',
    ]);
    expect(socket.end).toHaveBeenCalledOnce();
  });

  it('uses plaintext sockets and PASS when TLS is disabled', async () => {
    await adapter.send(ctx({ IRC_PASSWORD: 'pw' }), '#ship', {
      id: 'src-1',
      channel: 'src',
      identity: { network: 'slack', username: 'bob' },
      text: 'hello',
      timestamp: '2026-05-21T00:00:00.000Z',
    }, {
      server: 'irc.example.net',
      nick: 'sh1pt',
      tls: false,
      passwordKey: 'IRC_PASSWORD',
    });

    expect(sockets.net).toHaveLength(1);
    const socket = sockets.net[0]!;
    socket.emit('connect');
    expect(socket.writes.slice(0, 3)).toEqual([
      'PASS pw\r\n',
      'NICK sh1pt\r\n',
      'USER sh1pt 0 * :sh1pt\r\n',
    ]);
  });

  it('subscribes to channels, responds to PING, and maps PRIVMSG events', async () => {
    const onMessage = vi.fn();
    const subscription = await adapter.subscribe(ctx({}), ['#ship'], onMessage, {
      server: 'irc.example.net',
      nick: 'sh1pt',
    });

    expect(sockets.tls).toHaveLength(1);
    const socket = sockets.tls[0]!;
    socket.emit('connect');
    expect(socket.writes).toContain('JOIN #ship\r\n');

    socket.emit('data', 'PING :server.example\r\n');
    socket.emit('data', ':ada!~ada@example PRIVMSG #ship :hello from irc\r\n');
    socket.emit('data', ':ada!~ada@example PRIVMSG #other :ignored\r\n');

    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(1));
    expect(socket.writes).toContain('PONG :server.example\r\n');
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: '#ship',
      identity: { network: 'irc', username: 'ada' },
      text: 'hello from irc',
      originalNetwork: 'irc',
    }));

    await subscription.close();
    expect(socket.end).toHaveBeenCalledOnce();
    expect(socket.destroy).toHaveBeenCalledOnce();
  });

  it('requires a vault password when SASL is enabled', async () => {
    await expect(adapter.subscribe(ctx({}), ['#ship'], vi.fn(), {
      server: 'irc.example.net',
      nick: 'sh1pt',
      sasl: true,
    })).rejects.toThrow('IRC_PASSWORD not in vault');
  });
});

function ctx(secrets: Record<string, string>) {
  return {
    secret(key: string) {
      return secrets[key];
    },
    log: vi.fn(),
    dryRun: false,
  };
}
