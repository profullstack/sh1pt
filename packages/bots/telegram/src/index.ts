import { Bot, type Context } from "grammy";
import { z } from "zod";
import { defineBot, tokenSetup, type BotEvent, type BotHandler } from "@profullstack/sh1pt-core";

const configSchema = z.object({
  botToken: z.string().min(1),
  botTrigger: z.string().default("/"),
  botName: z.string().default("Bot"),
  aiProvider: z.enum(["claude-code", "opencode", "qwen"]).default("claude-code"),
  aiCliPath: z.string().default("claude"),
  aiModel: z.string().optional(),
  sessionTimeoutMs: z.number().int().positive().default(30 * 60 * 1000),
  maxOutputLength: z.number().int().positive().default(4000),
  maxConcurrentSessions: z.number().int().positive().default(5),
  allowedUsers: z.array(z.string()).default([]),
  adminUsers: z.array(z.string()).default([]),
});

export type Config = z.infer<typeof configSchema>;

export interface IncomingMessage {
  source: string;
  sourceName: string;
  text: string;
  timestamp: number;
  chatId: number;
  isGroup: boolean;
  attachments: Array<{ filename: string; url: string }>;
  raw: Context;
}

type MessageHandler = (msg: IncomingMessage) => void | Promise<void>;

export class TelegramBot {
  private bot: Bot;
  private handlers: MessageHandler[] = [];
  private config: Config;
  private running = false;

  constructor(config: Config) {
    this.config = config;
    this.bot = new Bot(config.botToken);
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    this.bot.on("message:text", async (ctx) => {
      const msg = ctx.message;
      if (!msg || !msg.text) return;

      const incoming: IncomingMessage = {
        source: String(msg.from?.id),
        sourceName: msg.from?.first_name || msg.from?.username || "User",
        text: msg.text,
        timestamp: msg.date * 1000,
        chatId: msg.chat.id,
        isGroup: msg.chat.type === "group" || msg.chat.type === "supergroup",
        attachments: [],
        raw: ctx,
      };

      for (const handler of this.handlers) {
        try {
          const result = handler(incoming);
          if (result instanceof Promise) result.catch(console.error);
        } catch (err) {
          console.error("Handler error:", err);
        }
      }
    });

    await this.bot.start();
    this.running = true;
    console.log("Telegram bot started");
  }

  async stop(): Promise<void> {
    await this.bot.stop();
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  async reply(msg: IncomingMessage, text: string): Promise<void> {
    await msg.raw.reply(text);
  }

  async send(chatId: number, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, text);
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return configSchema.parse({
    botToken: env.TELEGRAM_BOT_TOKEN || "",
    botTrigger: env.BOT_TRIGGER || "/",
    botName: env.BOT_NAME || "Bot",
    aiProvider: (env.AI_PROVIDER as any) || "claude-code",
    aiCliPath: env.AI_CLI_PATH || "claude",
    aiModel: env.AI_MODEL,
    sessionTimeoutMs: parseInt(env.SESSION_TIMEOUT_MS || "1800000", 10),
    maxOutputLength: parseInt(env.MAX_OUTPUT_LENGTH || "4000", 10),
    maxConcurrentSessions: parseInt(env.MAX_CONCURRENT_SESSIONS || "5", 10),
    allowedUsers: env.ALLOWED_USERS?.split(",").map((u) => u.trim()).filter(Boolean) || [],
    adminUsers: env.ADMIN_USERS?.split(",").map((u) => u.trim()).filter(Boolean) || [],
  });
}

function toBotEvent(msg: IncomingMessage): BotEvent {
  return {
    type: "message",
    channel: String(msg.chatId),
    user: {
      id: msg.source,
      displayName: msg.sourceName,
    },
    text: msg.text,
    attachments: msg.attachments.map((a) => ({ url: a.url, filename: a.filename })),
    timestamp: new Date(msg.timestamp).toISOString(),
    raw: msg.raw,
  };
}

export default defineBot<Partial<Config>>({
  id: "bot-telegram",
  label: "Telegram",
  supports: ["message", "command"],

  async register(ctx, handlers: BotHandler[], config) {
    const token = config.botToken ?? ctx.secret("TELEGRAM_BOT_TOKEN");
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN not in vault");
    ctx.log(`bot-telegram · register ${handlers.length} handlers`);
    if (ctx.dryRun) return { async close() {} };

    const bot = new TelegramBot(configSchema.parse({ ...config, botToken: token }));
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
    const token = config.botToken ?? ctx.secret("TELEGRAM_BOT_TOKEN");
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN not in vault");
    ctx.log(`bot-telegram · send → chat=${channel}`);
    if (ctx.dryRun) return { id: "dry-run" };

    const chatId = Number(channel);
    if (!Number.isFinite(chatId)) throw new Error(`Invalid Telegram chat id: ${channel}`);
    const bot = new TelegramBot(configSchema.parse({ ...config, botToken: token }));
    await bot.send(chatId, reply.text ?? "");
    return { id: `tg_${Date.now()}` };
  },

  setup: tokenSetup({
    secretKey: "TELEGRAM_BOT_TOKEN",
    label: "Telegram bot",
    vendorDocUrl: "https://core.telegram.org/bots/tutorial",
    steps: [
      "Open https://core.telegram.org/bots/tutorial",
      "Create a bot with BotFather",
      "Copy the token shown (usually once)",
    ],
  }),
});
