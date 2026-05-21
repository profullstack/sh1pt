import { defineBot, manualSetup, type BotCtx, type BotEvent, type BotHandler, type BotReply } from '@profullstack/sh1pt-core';
import { createConnection, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

// IRC bot — classic RFC 2812. Minimal interactivity (no rich components),
// commands are !trigger or PRIVMSG parsing. SASL auth via IRC_PASSWORD.
interface Config {
  server: string;
  port?: number;
  nick: string;
  username?: string;
  realName?: string;
  channels: string[];
  tls?: boolean;
  password?: string;
  nickservPassword?: string;
  commandPrefix?: string;
  connectTimeoutMs?: number;
}

const DEFAULT_PORT = 6667;
const DEFAULT_TLS_PORT = 6697;
const DEFAULT_COMMAND_PREFIX = '!';

class IrcClient {
  private socket?: Socket;
  private buffer = '';
  private closed = false;

  constructor(
    private readonly config: Required<Pick<Config, 'server' | 'nick' | 'channels'>> & Config,
    private readonly ctx: BotCtx,
  ) {}

  async connect(handlers: BotHandler[]): Promise<void> {
    const port = this.config.port ?? (this.config.tls ? DEFAULT_TLS_PORT : DEFAULT_PORT);
    const timeoutMs = this.config.connectTimeoutMs ?? 10_000;
    this.socket = this.config.tls
      ? tlsConnect({ host: this.config.server, port, servername: this.config.server })
      : createConnection({ host: this.config.server, port });
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk) => this.onData(String(chunk), handlers));
    this.socket.on('error', (err) => this.ctx.log(`bot-irc socket error: ${err.message}`));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`IRC connect timed out after ${timeoutMs}ms`)), timeoutMs);
      this.socket?.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket?.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    this.register();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (!this.socket) return;
    if (!this.socket.destroyed) {
      this.write('QUIT :sh1pt bot closing');
      this.socket.end();
    }
  }

  send(channel: string, reply: BotReply): void {
    const text = (reply.text ?? '').replace(/\r?\n/g, ' ').trim();
    if (!text) return;
    this.write(`PRIVMSG ${channel} :${text}`);
  }

  private register(): void {
    if (this.config.password) this.write(`PASS ${this.config.password}`);
    this.write(`NICK ${this.config.nick}`);
    this.write(`USER ${this.config.username ?? this.config.nick} 0 * :${this.config.realName ?? this.config.nick}`);
    if (this.config.nickservPassword) {
      this.write(`PRIVMSG NickServ :IDENTIFY ${this.config.nickservPassword}`);
    }
    for (const channel of this.config.channels) {
      this.write(`JOIN ${channel}`);
    }
  }

  private onData(chunk: string, handlers: BotHandler[]): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line) void this.onLine(line, handlers);
    }
  }

  private async onLine(line: string, handlers: BotHandler[]): Promise<void> {
    const message = parseIrcLine(line);
    if (message.command === 'PING') {
      this.write(`PONG :${message.trailing ?? message.params[0] ?? ''}`);
      return;
    }
    if (message.command !== 'PRIVMSG') return;

    const channel = message.params[0];
    const text = message.trailing ?? '';
    if (!channel || !text) return;

    const event = toBotEvent(message.prefix, channel, text, this.config.commandPrefix ?? DEFAULT_COMMAND_PREFIX, line);
    for (const handler of handlers) {
      const reply = await handler.handle(this.ctx, event);
      if (reply?.text) this.send(event.channel, reply);
    }
  }

  private write(line: string): void {
    if (!this.socket || this.socket.destroyed) return;
    this.socket.write(`${line}\r\n`);
  }
}

function parseIrcLine(line: string): { prefix?: string; command: string; params: string[]; trailing?: string } {
  let rest = line;
  let prefix: string | undefined;
  if (rest.startsWith(':')) {
    const end = rest.indexOf(' ');
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);
  }
  const trailingIndex = rest.indexOf(' :');
  const trailing = trailingIndex >= 0 ? rest.slice(trailingIndex + 2) : undefined;
  const head = trailingIndex >= 0 ? rest.slice(0, trailingIndex) : rest;
  const [command = '', ...params] = head.split(/\s+/).filter(Boolean);
  return { prefix, command: command.toUpperCase(), params, trailing };
}

function toBotEvent(prefix: string | undefined, channel: string, text: string, commandPrefix: string, raw: string): BotEvent {
  const user = parsePrefix(prefix);
  const isCommand = text.startsWith(commandPrefix) && text.length > commandPrefix.length;
  const [command, ...args] = isCommand ? text.slice(commandPrefix.length).trim().split(/\s+/) : [];
  return {
    type: isCommand ? 'command' : 'message',
    channel,
    user,
    text,
    command,
    args: isCommand ? args : undefined,
    timestamp: new Date().toISOString(),
    raw,
  };
}

function parsePrefix(prefix: string | undefined): BotEvent['user'] {
  if (!prefix) return { id: 'unknown' };
  const [nick = prefix, host = ''] = prefix.split('!');
  return {
    id: prefix,
    username: nick,
    displayName: nick,
    isBot: /bot/i.test(nick) || /bot/i.test(host),
  };
}

function resolveConfig(ctx: { secret(k: string): string | undefined }, config: Config): Config {
  return {
    ...config,
    password: config.password ?? ctx.secret('IRC_PASSWORD'),
    nickservPassword: config.nickservPassword ?? ctx.secret('IRC_NICKSERV_PASSWORD'),
  };
}

export default defineBot<Config>({
  id: 'bot-irc',
  label: 'IRC',
  supports: ['message', 'command', 'join', 'leave'],

  async register(ctx, handlers, config) {
    const resolved = resolveConfig(ctx, config);
    ctx.log(`bot-irc · register ${handlers.length} handlers (${resolved.nick}@${resolved.server})`);
    if (ctx.dryRun) return { async close() {} };
    const client = new IrcClient(resolved as Required<Pick<Config, 'server' | 'nick' | 'channels'>> & Config, ctx);
    await client.connect(handlers);
    return { close: () => client.close() };
  },

  async send(ctx, channel, reply, config) {
    const resolved = resolveConfig(ctx, config);
    ctx.log(`bot-irc · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    const client = new IrcClient(resolved as Required<Pick<Config, 'server' | 'nick' | 'channels'>> & Config, ctx);
    await client.connect([]);
    try {
      client.send(channel, reply);
    } finally {
      await client.close();
    }
    return { id: `i_${Date.now()}` };
  },

  setup: manualSetup({
    label: "IRC",
    vendorDocUrl: "https://datatracker.ietf.org/doc/html/rfc1459",
    steps: [
      "IRC uses nickname + optional NickServ password",
      "Pick a server (e.g. irc.libera.chat:6697 TLS), a nickname, and channels to join",
      "Run: sh1pt secret set IRC_NICKSERV_PASSWORD <pw>  (only if your nick is registered)",
    ],
  }),
});
