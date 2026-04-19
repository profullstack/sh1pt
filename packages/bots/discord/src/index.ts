import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message as DiscordMessage,
} from "discord.js";
import { z } from "zod";

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

    const attachments = msg.attachments.map((a: any) => ({
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
    if (!channel || !("send" in channel)) throw new Error(`Channel ${channelId} not found`);
    await channel.send(message);
  }

  async sendTyping(channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && "sendTyping" in channel) await channel.sendTyping();
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