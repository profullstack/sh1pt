import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { defineBot, tokenSetup, type BotCtx, type BotEvent, type BotHandler } from "@profullstack/sh1pt-core";

// Twitch bot using Twitch IRC chat over TLS. OAuth token via TWITCH_OAUTH_TOKEN
// with chat:read and chat:write scopes.
export interface Config {
  channel: string;
  channels?: string[];
  username?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  commandPrefix?: string;
  connectionFactory?: TwitchConnectionFactory;
}

export interface TwitchConnectionOptions {
  host: string;
  port: number;
  secure: boolean;
}

export type TwitchConnectionFactory = (
  options: TwitchConnectionOptions,
  onConnect: () => void,
) => Socket;

interface IrcMessage {
  raw: string;
  tags: Record<string, string>;
  prefix?: string;
  command: string;
  params: string[];
  trailing?: string;
}

const DEFAULT_HOST = "irc.chat.twitch.tv";
const DEFAULT_TLS_PORT = 6697;
const DEFAULT_PLAIN_PORT = 6667;
const DEFAULT_COMMAND_PREFIX = "!";

export default defineBot<Config>({
  id: "bot-twitch",
  label: "Twitch",
  supports: ["message", "command", "join", "leave"],

  async register(ctx, handlers, config) {
    const token = getOAuthToken(ctx);
    const username = getUsername(ctx, config);
    const channels = getChannels(config);
    ctx.log(`bot-twitch register ${handlers.length} handlers (${channels.join(", ")})`);
    if (ctx.dryRun) return { async close() {} };

    const socket = await connectToTwitch(config);
    socket.setEncoding("utf8");
    authenticate(socket, token, username, channels);

    let buffer = "";
    const onData = (chunk: string | Buffer) => {
      buffer += String(chunk);
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) void handleIrcLine(ctx, handlers, socket, line, config);
    };
    socket.on("data", onData);

    const abort = () => socket.destroy();
    ctx.signal?.addEventListener("abort", abort, { once: true });

    return {
      async close() {
        ctx.signal?.removeEventListener("abort", abort);
        socket.off("data", onData);
        socket.end();
      },
    };
  },

  async send(ctx, channel, reply, config) {
    const token = getOAuthToken(ctx);
    const username = getUsername(ctx, config);
    const targetChannel = toChannelName(channel || config.channel);
    ctx.log(`bot-twitch send #${targetChannel}`);
    if (ctx.dryRun) return { id: "dry-run" };

    const socket = await connectToTwitch(config);
    authenticate(socket, token, username, [targetChannel]);
    if (reply.text) sendPrivmsg(socket, targetChannel, reply.text);
    socket.end();
    return { id: `tw_${Date.now()}` };
  },

  setup: tokenSetup({
    secretKey: "TWITCH_OAUTH_TOKEN",
    label: "Twitch bot",
    vendorDocUrl: "https://dev.twitch.tv/docs/chat/irc",
    steps: [
      "Create or choose a Twitch bot account",
      "Generate a user access token with chat:read and chat:write scopes",
      "Store the token as TWITCH_OAUTH_TOKEN and the lowercase bot login as TWITCH_BOT_USERNAME",
    ],
  }),
});

function getOAuthToken(ctx: { secret(k: string): string | undefined }): string {
  const token = ctx.secret("TWITCH_OAUTH_TOKEN") ?? ctx.secret("TWITCH_ACCESS_TOKEN");
  if (!token) throw new Error("TWITCH_OAUTH_TOKEN not in vault");
  return token.startsWith("oauth:") ? token : `oauth:${token}`;
}

function getUsername(
  ctx: { secret(k: string): string | undefined },
  config: Pick<Config, "username">,
): string {
  const username = config.username ?? ctx.secret("TWITCH_BOT_USERNAME") ?? ctx.secret("TWITCH_USERNAME");
  if (!username) throw new Error("TWITCH_BOT_USERNAME not in vault");
  return username.toLowerCase();
}

function getChannels(config: Pick<Config, "channel" | "channels">): string[] {
  const channels = config.channels?.length ? config.channels : [config.channel];
  return [...new Set(channels.map(toChannelName))];
}

function toChannelName(channel: string): string {
  const normalized = channel.trim().replace(/^#/, "").toLowerCase();
  if (!normalized) throw new Error("Twitch channel is required");
  return normalized;
}

async function connectToTwitch(config: Config): Promise<Socket> {
  const secure = config.secure ?? true;
  const options = {
    host: config.host ?? DEFAULT_HOST,
    port: config.port ?? (secure ? DEFAULT_TLS_PORT : DEFAULT_PLAIN_PORT),
    secure,
  };
  const factory = config.connectionFactory ?? defaultConnectionFactory;

  return await new Promise<Socket>((resolve, reject) => {
    let settled = false;
    let socket: Socket;
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    socket = factory(options, () => {
      if (settled) return;
      settled = true;
      socket.off("error", onError);
      resolve(socket);
    });
    socket.once("error", onError);
  });
}

const defaultConnectionFactory: TwitchConnectionFactory = (options, onConnect) => {
  if (options.secure) return tlsConnect({ host: options.host, port: options.port }, onConnect);
  return netConnect({ host: options.host, port: options.port }, onConnect);
};

function authenticate(socket: Socket, token: string, username: string, channels: string[]): void {
  writeLine(socket, "CAP REQ :twitch.tv/tags twitch.tv/commands");
  writeLine(socket, `PASS ${token}`);
  writeLine(socket, `NICK ${username}`);
  writeLine(socket, `JOIN ${channels.map((channel) => `#${channel}`).join(",")}`);
}

async function handleIrcLine(
  ctx: BotCtx,
  handlers: BotHandler[],
  socket: Socket,
  line: string,
  config: Pick<Config, "commandPrefix">,
): Promise<void> {
  if (!line) return;
  const message = parseIrcMessage(line);
  if (message.command === "PING") {
    const payload = message.trailing ?? message.params[0] ?? "tmi.twitch.tv";
    writeLine(socket, `PONG :${payload.replace(/^:/, "")}`);
    return;
  }

  const event = toBotEvent(message, config.commandPrefix ?? DEFAULT_COMMAND_PREFIX);
  if (!event) return;

  for (const handler of handlers) {
    if (!matches(handler, event)) continue;
    try {
      const reply = await handler.handle(ctx, event);
      if (reply?.text) sendPrivmsg(socket, event.channel, reply.text, event.replyToId);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      ctx.log(`bot-twitch handler error: ${messageText}`);
    }
  }
}

function toBotEvent(message: IrcMessage, commandPrefix: string): BotEvent | undefined {
  if (message.command === "PRIVMSG") {
    const channel = toChannelName(message.params[0] ?? "");
    const text = message.trailing ?? "";
    const user = parseUser(message);
    const timestamp = tagTimestamp(message.tags["tmi-sent-ts"]);
    if (text.startsWith(commandPrefix) && text.length > commandPrefix.length) {
      const [command, ...args] = text.slice(commandPrefix.length).trim().split(/\s+/).filter(Boolean);
      if (command) {
        return {
          type: "command",
          channel,
          user,
          text,
          command,
          args,
          replyToId: message.tags.id,
          timestamp,
          raw: message,
        };
      }
    }
    return {
      type: "message",
      channel,
      user,
      text,
      replyToId: message.tags.id,
      timestamp,
      raw: message,
    };
  }

  if (message.command === "JOIN" || message.command === "PART") {
    return {
      type: message.command === "JOIN" ? "join" : "leave",
      channel: toChannelName(message.params[0] ?? message.trailing ?? ""),
      user: parseUser(message),
      timestamp: new Date().toISOString(),
      raw: message,
    };
  }

  return undefined;
}

function parseUser(message: IrcMessage): BotEvent["user"] {
  const username = message.prefix?.split("!")[0] ?? message.tags.login ?? "unknown";
  return {
    id: message.tags["user-id"] || username,
    username,
    displayName: message.tags["display-name"] || username,
    isBot: false,
  };
}

function tagTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function matches(handler: BotHandler, event: BotEvent): boolean {
  const match = handler.match;
  if (match.type !== event.type) return false;
  if (match.type === "message" && match.pattern) return match.pattern.test(event.text ?? "");
  if (match.type === "command") return event.command === match.command;
  if (match.type === "interaction") return !match.actionId || match.actionId === event.command;
  if (match.type === "reaction") return !match.emoji || match.emoji === event.text;
  return true;
}

function parseIrcMessage(line: string): IrcMessage {
  let rest = line;
  const tags: Record<string, string> = {};
  let prefix: string | undefined;

  if (rest.startsWith("@")) {
    const tagsEnd = rest.indexOf(" ");
    if (tagsEnd < 0) return { raw: line, tags, command: "", params: [] };
    const tagsPart = rest.slice(1, tagsEnd);
    rest = rest.slice(tagsEnd + 1);
    for (const pair of tagsPart.split(";")) {
      const [key, value = ""] = pair.split("=", 2);
      if (key) tags[key] = unescapeTagValue(value);
    }
  }

  if (rest.startsWith(":")) {
    const prefixEnd = rest.indexOf(" ");
    if (prefixEnd < 0) return { raw: line, tags, prefix: rest.slice(1), command: "", params: [] };
    prefix = rest.slice(1, prefixEnd);
    rest = rest.slice(prefixEnd + 1);
  }

  let trailing: string | undefined;
  const trailingStart = rest.indexOf(" :");
  if (trailingStart >= 0) {
    trailing = rest.slice(trailingStart + 2);
    rest = rest.slice(0, trailingStart);
  }

  const [command = "", ...params] = rest.trim().split(/\s+/).filter(Boolean);
  return { raw: line, tags, prefix, command, params, trailing };
}

function unescapeTagValue(value: string): string {
  return value
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function escapeTagValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\:")
    .replace(/\s/g, "\\s")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function sendPrivmsg(socket: Socket, channel: string, text: string, replyToId?: string): void {
  const prefix = replyToId ? `@reply-parent-msg-id=${escapeTagValue(replyToId)} ` : "";
  writeLine(socket, `${prefix}PRIVMSG #${toChannelName(channel)} :${sanitizeMessage(text)}`);
}

function sanitizeMessage(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

function writeLine(socket: Socket, line: string): void {
  socket.write(`${line}\r\n`);
}
