import {
  Client,
  GatewayIntentBits,
  Partials,
  type Attachment,
  type Message as DiscordMessage,
} from "discord.js";
import { z } from "zod";
import { defineBot, tokenSetup, type BotEvent, type BotHandler } from "@profullstack/sh1pt-core";

const configSchema = z.object({
  botToken: z.string().min(1),
  botTrigger: z.string().default("@claude"),
  botName: z.string().default("Claude"),
  dmEnabled: z.boolean().default(true),
  aiProvider: z.enum(["claude-code", "opencode", "qwen"]).default("claude-code"),
  aiCliPath: z.string().default("claude"),
  aiModel: z.string().optional(),
  sessionTimeoutMs: z.number().int().positive().default(30 * 60 * 1000),
  maxOutputLength: z.number().int().positive().default(2000),
  maxConcurrentSessions: z.number().int().positive().default(5),
  allowedUsers: z.array(z.string()).default([]),
  allowedChannels: z.array(z.string()).optional(),
  adminUsers: z.array(z.string()).default([]),
});

export type Config = z.infer<typeof configSchema>;

export interface IncomingMessage {
  source: string;
  sourceName: string;
  text: string;
  timestamp: number;
  channelId: string;
  guildId: string | null;
  isGuild: boolean;
  attachments: Array<{ filename: string; url: string; contentType: string }>;
  raw: DiscordMessage;
}

type MessageHandler = (msg: IncomingMessage) => void | Promise<void>;

export class DiscordBot {
  private client: Client;
  private handlers: MessageHandler[] = [];
  private token: string;
  private config: Config;
  private botUserId: string | null = null;
  private running = false;

  constructor(config: Config) {
    this.config = config;
    this.token = config.botToken;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageTyping,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    this.client.on("messageCreate", (msg) => this.handleMessage(msg));
    this.client.on("error", (err) => console.error("Discord error:", err.message));

    await this.client.login(this.token);
    this.running = true;
    this.botUserId = this.client.user?.id || null;
    console.log(`Discord bot started as ${this.client.user?.tag}`);
  }

  async stop(): Promise<void> {
    this.client.destroy();
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleMessage(msg: DiscordMessage): void {
    if (msg.author.bot) return;
    if (!msg.content && msg.attachments.size === 0) return;

    const attachments = msg.attachments.map((a: Attachment) => ({
      filename: a.name || a.id,
      url: a.url,
      contentType: a.contentType || "",
    }));

    const incoming: IncomingMessage = {
      source: msg.author.id,
      sourceName: msg.member?.displayName || msg.author.displayName || msg.author.username,
      text: msg.content || "",
      timestamp: msg.createdTimestamp,
      channelId: msg.channelId,
      guildId: msg.guildId,
      isGuild: !!msg.guildId,
      attachments,
      raw: msg,
    };

    for (const handler of this.handlers) {
      try {
        const result = handler(incoming);
        if (result instanceof Promise) result.catch(console.error);
      } catch (err) {
        console.error("Handler error:", err);
      }
    }
  }

  async send(channelId: string, message: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!isTextChannel(channel)) throw new Error(`Channel ${channelId} not found`);
    await channel.send(message);
  }

  async sendTyping(channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (isTextChannel(channel) && "sendTyping" in channel) await channel.sendTyping();
    } catch {}
  }

  async reply(msg: IncomingMessage, text: string): Promise<void> {
    try {
      await msg.raw.reply({ content: text, allowedMentions: { repliedUser: false } });
    } catch {
      await this.send(msg.channelId, text);
    }
  }

  getBotUserId(): string | null {
    return this.botUserId;
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return configSchema.parse({
    botToken: env.DISCORD_BOT_TOKEN || "",
    botTrigger: env.BOT_TRIGGER || "@claude",
    botName: env.BOT_NAME || "Claude",
    dmEnabled: env.DM_ENABLED !== "false",
    aiProvider: (env.AI_PROVIDER as any) || "claude-code",
    aiCliPath: env.AI_CLI_PATH || "claude",
    aiModel: env.AI_MODEL,
    sessionTimeoutMs: parseInt(env.SESSION_TIMEOUT_MS || "1800000", 10),
    maxOutputLength: parseInt(env.MAX_OUTPUT_LENGTH || "2000", 10),
    maxConcurrentSessions: parseInt(env.MAX_CONCURRENT_SESSIONS || "5", 10),
    allowedUsers: env.ALLOWED_USERS?.split(",").map((u) => u.trim()).filter(Boolean) || [],
    allowedChannels: env.ALLOWED_CHANNELS?.split(",").map((c) => c.trim()).filter(Boolean),
    adminUsers: env.ADMIN_USERS?.split(",").map((u) => u.trim()).filter(Boolean) || [],
  });
}

interface SendableChannel {
  send(message: string): Promise<unknown>;
  sendTyping?: () => Promise<unknown>;
}

function isTextChannel(channel: unknown): channel is SendableChannel {
  return !!channel && typeof channel === "object" && "send" in channel;
}

function toBotEvent(msg: IncomingMessage): BotEvent {
  return {
    type: "message",
    channel: msg.channelId,
    user: {
      id: msg.source,
      displayName: msg.sourceName,
    },
    text: msg.text,
    attachments: msg.attachments.map((a) => ({
      url: a.url,
      filename: a.filename,
      mimeType: a.contentType,
    })),
    timestamp: new Date(msg.timestamp).toISOString(),
    raw: msg.raw,
  };
}

export default defineBot<Partial<Config>>({
  id: "bot-discord",
  label: "Discord",
  supports: ["message", "command", "interaction", "reaction", "join", "leave"],

  async register(ctx, handlers: BotHandler[], config) {
    const token = config.botToken ?? ctx.secret("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("DISCORD_BOT_TOKEN not in vault");
    ctx.log(`bot-discord · register ${handlers.length} handlers`);
    if (ctx.dryRun) return { async close() {} };

    const bot = new DiscordBot(configSchema.parse({ ...config, botToken: token }));
    bot.onMessage(async (msg) => {
      const event = toBotEvent(msg);
      for (const handler of handlers) {
        const reply = await handler.handle(ctx, event);
        if (reply?.text) await bot.reply(msg, reply.text);
      }
    });
    await bot.start();
    return { close: () => bot.stop() };
  },

  async send(ctx, channel, reply, config) {
    const token = config.botToken ?? ctx.secret("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("DISCORD_BOT_TOKEN not in vault");
    ctx.log(`bot-discord · send → channel=${channel}`);
    if (ctx.dryRun) return { id: "dry-run" };

    const bot = new DiscordBot(configSchema.parse({ ...config, botToken: token }));
    await bot.start();
    try {
      await bot.send(channel, reply.text ?? "");
    } finally {
      await bot.stop();
    }
    return { id: `d_${Date.now()}` };
  },

  setup: tokenSetup({
    secretKey: "DISCORD_BOT_TOKEN",
    label: "Discord bot",
    vendorDocUrl: "https://discord.com/developers/applications",
    steps: [
      "Open https://discord.com/developers/applications",
      "Create a bot application / API key",
      "Copy the token shown (usually once)",
    ],
  }),
});
