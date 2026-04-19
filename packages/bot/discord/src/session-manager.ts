import { spawn } from "node:child_process";
import type { Config } from "./index.js";

export interface ClaudeResult {
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
  channelId: string;
  aiSessionId: string | null;
  lastActivity: number;
  busy: boolean;
  queue: Array<{
    prompt: string;
    senderName: string;
    resolve: (result: ClaudeResult) => void;
    reject: (err: Error) => void;
  }>;
  abortController: AbortController | null;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async sendMessage(
    channelId: string,
    prompt: string,
    senderName: string
  ): Promise<ClaudeResult> {
    const session = this.getOrCreateSession(channelId);

    if (session.busy) {
      return new Promise((resolve, reject) => {
        session.queue.push({ prompt, senderName, resolve, reject });
      });
    }

    return this.processMessage(session, prompt, senderName);
  }

  private getOrCreateSession(channelId: string): Session {
    let session = this.sessions.get(channelId);
    if (!session) {
      session = {
        channelId,
        aiSessionId: null,
        lastActivity: Date.now(),
        busy: false,
        queue: [],
        abortController: null,
      };
      this.sessions.set(channelId, session);
    }
    session.lastActivity = Date.now();
    return session;
  }

  private async processMessage(
    session: Session,
    prompt: string,
    senderName: string
  ): Promise<ClaudeResult> {
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error("Too many concurrent sessions");
    }

    session.busy = true;
    session.abortController = new AbortController();

    try {
      const args = this.buildArgs(session.aiSessionId);
      const proc = spawn(this.config.aiCliPath, [...args, prompt], {
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
    args.push("--dangerously-skip-permissions");
    return args;
  }

  reset(channelId: string): void {
    const session = this.sessions.get(channelId);
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