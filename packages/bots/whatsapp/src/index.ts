import makeBaileysBot, { type WASocket } from "baileys";
import { z } from "zod";
import { defineBot, manualSetup, type BotEvent, type BotHandler } from "@profullstack/sh1pt-core";

const configSchema = z.object({
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
  chatId: string;
  isGroup: boolean;
  attachments: Array<{ filename: string; url: string }>;
  raw: any;
}

type MessageHandler = (msg: IncomingMessage) => void | Promise<void>;

export class WhatsAppBot {
  private sock: WASocket | null = null;
  private handlers: MessageHandler[] = [];
  private config: Config;
  private running = false;

  constructor(config: Config) {
    this.config = config;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    const { state } = useMultiFileAuthState("./auth");

    this.sock = makeBaileysBot({
      auth: state,
      printQRInTerminal: true,
      browser: ["sh1pt-bot", "Chrome", "120"],
    });

    this.sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const chatId = msg.key.remoteJid!;
        const isGroup = chatId.endsWith("@g.us");
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          "";

        const incoming: IncomingMessage = {
          source: chatId,
          sourceName: msg.pushName || "User",
          text,
          timestamp: Number(msg.messageTimestamp ?? 0) * 1000,
          chatId,
          isGroup,
          attachments: [],
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
    });

    this.running = true;
    console.log("WhatsApp bot started");
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  async reply(msg: IncomingMessage, text: string): Promise<void> {
    await this.sock?.sendMessage(msg.chatId, { text });
  }

  async send(chatId: string, text: string): Promise<void> {
    await this.sock?.sendMessage(chatId, { text });
  }
}

function useMultiFileAuthState(
  dir: string
): { state: any; saveState: () => void } {
  return {
    state: {},
    saveState: () => {},
  };
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return configSchema.parse({
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
    channel: msg.chatId,
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
  id: "bot-whatsapp",
  label: "WhatsApp",
  supports: ["message"],

  async register(ctx, handlers: BotHandler[], config) {
    ctx.log(`bot-whatsapp · register ${handlers.length} handlers`);
    if (ctx.dryRun) return { async close() {} };

    const bot = new WhatsAppBot(configSchema.parse(config));
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
    ctx.log(`bot-whatsapp · send → chat=${channel}`);
    if (ctx.dryRun) return { id: "dry-run" };

    const bot = new WhatsAppBot(configSchema.parse(config));
    await bot.start();
    try {
      await bot.send(channel, reply.text ?? "");
    } finally {
      await bot.stop();
    }
    return { id: `wa_${Date.now()}` };
  },

  setup: manualSetup({
    label: "WhatsApp",
    vendorDocUrl: "https://developers.facebook.com/docs/whatsapp",
    steps: [
      "For WhatsApp Business Cloud API, create a Meta app and phone number",
      "For Baileys local runtime, scan the QR code generated on first start",
      "Cloud API token support belongs in the deploy target; this bot runtime uses local auth state",
    ],
  }),
});
