import makeBaileysBot, { type WASocket } from "baileys";
import { z } from "zod";

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

  setup: tokenSetup({
    secretKey: 'WHATSAPP_ACCESS_TOKEN',
    label: 'WhatsApp Business Cloud API',
    vendorDocUrl: 'https://developers.facebook.com/apps/',
    steps: [
      'Open https://developers.facebook.com/apps/',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
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
    const { state, saveState } = useMultiFileAuthState("./auth");

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
          timestamp: msg.messageTimestamp * 1000,
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