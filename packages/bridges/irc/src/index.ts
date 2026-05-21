import { createConnection, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { defineBridge, manualSetup, type BridgeMessage } from '@profullstack/sh1pt-core';

// IRC bridge — classic TCP/TLS client against any IRC network (Libera,
// OFTC, self-hosted InspIRCd, etc.). Use SASL for auth on modern networks.
interface Config {
  server: string;                   // e.g. 'irc.libera.chat'
  port?: number;                    // default 6697 TLS
  nick: string;
  realname?: string;
  sasl?: boolean;                   // use SASL PLAIN — requires NICK password in vault
  tls?: boolean;
  username?: string;
  passwordKey?: string;
}

const DEFAULT_PASSWORD_KEY = 'IRC_PASSWORD';

export default defineBridge<Config>({
  id: 'bridge-irc',
  label: 'IRC',

  async subscribe(ctx, channels, onMessage, config) {
    const password = ircPassword(ctx, config);
    ctx.log(`irc bridge · ${config.server}:${config.port ?? 6697} · channels=${channels.join(',')}`);

    const socket = connectIrc(config);
    const subscribed = new Set(channels);
    let buffer = '';

    socket.on('connect', () => {
      register(socket, config, password);
      for (const channel of channels) writeLine(socket, `JOIN ${channel}`);
    });

    socket.on('data', async (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith('PING ')) {
          writeLine(socket, `PONG ${line.slice(5)}`);
          continue;
        }
        const message = parsePrivmsg(line);
        if (message && subscribed.has(message.channel)) {
          await onMessage(message);
        }
      }
    });

    return {
      async close() {
        socket.end();
        socket.destroy();
      },
    };
  },

  async send(ctx, channel, msg, config) {
    const password = ircPassword(ctx, config);
    ctx.log(`irc bridge · PRIVMSG ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const socket = connectIrc(config);
    socket.on('connect', () => {
      register(socket, config, password);
      for (const line of splitIrcLines(renderIrcMessage(msg))) {
        writeLine(socket, `PRIVMSG ${channel} :${line}`);
      }
      socket.end();
    });

    return { id: `irc_${Date.now()}` };
  },

  setup: manualSetup({
    label: "IRC bridge",
    vendorDocUrl: "https://datatracker.ietf.org/doc/html/rfc1459",
    steps: [
      "Configure server host + port + TLS + nickname in sh1pt.config.ts",
      "Run: sh1pt secret set IRC_NICKSERV_PASSWORD <pw>  (only if your nick is registered)",
    ],
  }),
});

function ircPassword(
  ctx: { secret(k: string): string | undefined },
  config: Config,
): string | undefined {
  const key = config.passwordKey ?? DEFAULT_PASSWORD_KEY;
  const password = ctx.secret(key);
  if (config.sasl && !password) throw new Error(`${key} not in vault (SASL enabled)`);
  return password;
}

function connectIrc(config: Config): Socket {
  const port = config.port ?? (config.tls === false ? 6667 : 6697);
  if (config.tls === false) return createConnection({ host: config.server, port });
  return tlsConnect({ host: config.server, port, servername: config.server });
}

function register(socket: Socket, config: Config, password?: string): void {
  const username = sanitizeIrcToken(config.username ?? config.nick);
  const nick = sanitizeIrcToken(config.nick);
  if (config.sasl) writeLine(socket, 'CAP REQ :sasl');
  if (password && !config.sasl) writeLine(socket, `PASS ${password}`);
  writeLine(socket, `NICK ${nick}`);
  writeLine(socket, `USER ${username} 0 * :${config.realname ?? nick}`);
  if (config.sasl && password) {
    writeLine(socket, 'AUTHENTICATE PLAIN');
    writeLine(socket, `AUTHENTICATE ${Buffer.from(`${username}\0${username}\0${password}`).toString('base64')}`);
    writeLine(socket, 'CAP END');
  }
}

function parsePrivmsg(line: string): BridgeMessage | undefined {
  const match = /^:([^!\s]+)(?:![^\s]+)? PRIVMSG ([^\s]+) :(.+)$/.exec(line);
  if (!match) return undefined;
  const nick = match[1]!;
  const channel = match[2]!;
  const text = match[3]!;
  return {
    id: `irc-${channel}-${Date.now()}`,
    channel,
    identity: { network: 'irc', username: nick },
    text,
    timestamp: new Date().toISOString(),
    originalNetwork: 'irc',
  };
}

function renderIrcMessage(msg: BridgeMessage): string {
  const source = `${msg.identity.username} [${msg.originalNetwork ?? msg.identity.network}]`;
  const attachments = (msg.attachments ?? []).map((a) => `${a.kind}: ${a.url}`);
  return [ `${source}: ${msg.text}`, ...attachments ].filter(Boolean).join(' ');
}

function splitIrcLines(value: string): string[] {
  const maxLength = 400;
  const chunks: string[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    let line = rawLine;
    while (line.length > maxLength) {
      chunks.push(line.slice(0, maxLength));
      line = line.slice(maxLength);
    }
    if (line) chunks.push(line);
  }
  return chunks.length > 0 ? chunks : [''];
}

function sanitizeIrcToken(value: string): string {
  return value.replace(/[\s\r\n]+/g, '_');
}

function writeLine(socket: Socket, line: string): void {
  socket.write(`${line}\r\n`);
}
