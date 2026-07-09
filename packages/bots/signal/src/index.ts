import { defineBot, manualSetup, type BotEvent, type BotHandler } from '@profullstack/sh1pt-core';
import { z } from "zod";
import { spawn, type ChildProcess } from "node:child_process";

const configSchema = z.object({
  botName: z.string().default("Bot"),
  signalCliPath: z.string().default("signal-cli"),
  phoneNumber: z.string().min(1),
  httpPort: z.number().int().positive().default(7580),
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
  groupId: string | null;
  isGroup: boolean;
  attachments: Array<{ filename: string; url: string }>;
}

type MessageHandler = (msg: IncomingMessage) => void | Promise<void>;

export class SignalBot {
  private handlers: MessageHandler[] = [];
  private config: Config;
  private running = false;
  private proc: ChildProcess | null = null;
  private fetchInterval: ReturnType<typeof setInterval> | null = null;
  private lastTimestamps = new Map<string, number>();

  constructor(config: Config) {
    this.config = config;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    this.running = true;
    console.log("Signal bot started (using REST API polling)");
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  async reply(msg: IncomingMessage, text: string): Promise<void> {
    await this.send(msg.source, text);
  }

  async send(recipient: string, text: string): Promise<void> {
    await this.apiCall("send", {
      recipient,
      message: text,
    });
  }

  private async apiCall(endpoint: string, body: any): Promise<any> {
    const url = `http://localhost:${this.config.httpPort}/v1/${endpoint}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch (err) {
      console.error(`Signal API error: ${err}`);
    }
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return configSchema.parse({
    botName: env.BOT_NAME || "Bot",
    signalCliPath: env.SIGNAL_CLI_PATH || "signal-cli",
    phoneNumber: env.SIGNAL_PHONE_NUMBER || "",
    httpPort: parseInt(env.SIGNAL_HTTP_PORT || "7580", 10),
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
    channel: msg.groupId ?? msg.source,
    user: {
      id: msg.source,
      displayName: msg.sourceName,
    },
    text: msg.text,
    attachments: msg.attachments.map((a) => ({ url: a.url, filename: a.filename })),
    timestamp: new Date(msg.timestamp).toISOString(),
  };
}

export default defineBot<Partial<Config>>({
  id: "bot-signal",
  label: "Signal (signal-cli)",
  supports: ["message"],

  async register(ctx, handlers: BotHandler[], config) {
    const phoneNumber = config.phoneNumber ?? ctx.secret("SIGNAL_PHONE_NUMBER");
    if (!phoneNumber) throw new Error("SIGNAL_PHONE_NUMBER not in vault");
    ctx.log(`bot-signal · register ${handlers.length} handlers`);
    if (ctx.dryRun) return { async close() {} };

    const bot = new SignalBot(configSchema.parse({ ...config, phoneNumber }));
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
    const phoneNumber = config.phoneNumber ?? ctx.secret("SIGNAL_PHONE_NUMBER");
    if (!phoneNumber) throw new Error("SIGNAL_PHONE_NUMBER not in vault");
    ctx.log(`bot-signal · send → recipient=${channel}`);
    if (ctx.dryRun) return { id: "dry-run" };

    const bot = new SignalBot(configSchema.parse({ ...config, phoneNumber }));
    await bot.send(channel, reply.text ?? "");
    return { id: `sig_${Date.now()}` };
  },

  setup: manualSetup({
    label: "Signal (signal-cli)",
    vendorDocUrl: "https://github.com/AsamK/signal-cli",
    steps: [
      "Install signal-cli: brew install signal-cli OR download from GitHub releases",
      "Register a dedicated number: signal-cli -u +12345550100 register",
      "Verify: signal-cli -u +12345550100 verify <code>",
      "Run: sh1pt secret set SIGNAL_PHONE_NUMBER <number>",
    ],
  }),
});
