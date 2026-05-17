import { spawn } from "node:child_process";
import { z } from "zod";

export const aiConfigSchema = z.object({
  aiProvider: z.enum(["claude-code", "opencode", "qwen"]).default("claude-code"),
  aiCliPath: z.string().default("claude"),
  aiModel: z.string().optional(),
  aiMaxTurns: z.number().int().positive().default(10),
  sessionTimeoutMs: z.number().int().positive().default(30 * 60 * 1000),
  maxConcurrentSessions: z.number().int().positive().default(5),
});

export type AIConfig = z.infer<typeof aiConfigSchema>;

export interface AIResult {
  type: "result";
  subtype: "success" | "error";
  is_error: boolean;
  result: string;
  duration_ms: number;
  num_turns: number;
  session_id: string;
  total_cost_usd: number;
}

export interface Session {
  id: string;
  aiSessionId: string | null;
  lastActivity: number;
  busy: boolean;
  queue: Array<{
    prompt: string;
    senderName: string;
    resolve: (result: AIResult) => void;
    reject: (err: Error) => void;
  }>;
  abortController: AbortController | null;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  async sendMessage(
    sessionId: string,
    prompt: string,
    senderName: string
  ): Promise<AIResult> {
    const session = this.getOrCreateSession(sessionId);

    if (session.busy) {
      return new Promise((resolve, reject) => {
        session.queue.push({ prompt, senderName, resolve, reject });
      });
    }

    return this.processMessage(session, prompt, senderName);
  }

  private getOrCreateSession(sessionId: string): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        aiSessionId: null,
        lastActivity: Date.now(),
        busy: false,
        queue: [],
        abortController: null,
      };
      this.sessions.set(sessionId, session);
    }

    if (Date.now() - session.lastActivity > this.config.sessionTimeoutMs) {
      session.aiSessionId = null;
    }

    session.lastActivity = Date.now();
    return session;
  }

  private async processMessage(
    session: Session,
    prompt: string,
    senderName: string
  ): Promise<AIResult> {
    if ([...this.sessions.values()].filter((s) => s.busy).length >= this.config.maxConcurrentSessions) {
      throw new Error("Too many concurrent sessions");
    }

    session.busy = true;
    session.abortController = new AbortController();

    try {
      const args = this.buildArgs(session.aiSessionId);
      const contextualPrompt = `[${senderName}]: ${prompt}`;

      const proc = spawn(this.config.aiCliPath, [...args, contextualPrompt], {
        stdio: ["pipe", "pipe", "pipe"],
        signal: session.abortController.signal,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
      proc.stderr?.on("data", (chunk) => (stderr += chunk.toString()));

      return new Promise((resolve) => {
        proc.on("close", (code) => {
          if (stdout.trim()) {
            try {
              const parsed = JSON.parse(stdout.trim());
              if (parsed.session_id) session.aiSessionId = parsed.session_id;
              resolve({
                type: "result",
                subtype: parsed.is_error ? "error" : "success",
                is_error: parsed.is_error || false,
                result: parsed.result || "",
                duration_ms: parsed.duration_ms || 0,
                num_turns: parsed.num_turns || 0,
                session_id: parsed.session_id || "",
                total_cost_usd: parsed.total_cost_usd || 0,
              });
              return;
            } catch {}
          }
          resolve({
            type: "result",
            subtype: code === 0 ? "success" : "error",
            is_error: code !== 0,
            result: stderr || `Process exited with code ${code}`,
            duration_ms: 0,
            num_turns: 0,
            session_id: "",
            total_cost_usd: 0,
          });
        });
        proc.on("error", (err) => {
          resolve({
            type: "result",
            subtype: "error",
            is_error: true,
            result: err.message,
            duration_ms: 0,
            num_turns: 0,
            session_id: "",
            total_cost_usd: 0,
          });
        });
      });
    } finally {
      session.busy = false;
      session.abortController = null;
      this.processQueue(session);
    }
  }

  private processQueue(session: Session): void {
    if (session.queue.length === 0) return;
    const next = session.queue.shift()!;
    this.processMessage(session, next.prompt, next.senderName)
      .then(next.resolve)
      .catch(next.reject);
  }

  private buildArgs(sessionId: string | null): string[] {
    const args = ["--print", "--output-format", "json"];

    if (sessionId) args.push("--resume", sessionId);
    if (this.config.aiModel) args.push("--model", this.config.aiModel);
    if (this.config.aiProvider === "claude-code") args.push("--dangerously-skip-permissions");

    return args;
  }

  reset(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.abortController) session.abortController.abort();
      session.aiSessionId = null;
      session.queue = [];
    }
  }

  get activeSessions(): number {
    return [...this.sessions.values()].filter((s) => s.busy).length;
  }
}

export function loadAIConfig(env: Record<string, string | undefined>): AIConfig {
  return aiConfigSchema.parse({
    aiProvider: (env.AI_PROVIDER as any) || "claude-code",
    aiCliPath: env.AI_CLI_PATH || "claude",
    aiModel: env.AI_MODEL,
    aiMaxTurns: parseInt(env.AI_MAX_TURNS || "10", 10),
    sessionTimeoutMs: parseInt(env.SESSION_TIMEOUT_MS || "1800000", 10),
    maxConcurrentSessions: parseInt(env.MAX_CONCURRENT_SESSIONS || "5", 10),
  });
}

export function chunkMessage(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  while (text.length > maxLength) {
    const breakAt = text.lastIndexOf("\n", maxLength);
    const idx = breakAt > maxLength * 0.5 ? breakAt + 1 : maxLength;
    chunks.push(text.slice(0, idx));
    text = text.slice(idx);
  }
  chunks.push(text);
  return chunks;
}