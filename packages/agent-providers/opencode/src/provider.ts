import {
  AgentProviderConfigError,
  AgentProviderRequestError,
} from "@profullstack/sh1pt-agent-provider-shared";
import type { AgentProviderAdapter } from "@profullstack/sh1pt-agent-provider-shared";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandRunnerOptions {
  cwd?: string;
  env: Record<string, string | undefined>;
  timeoutMs: number;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: CommandRunnerOptions,
) => Promise<CommandResult>;

export interface OpencodeProviderOptions {
  env?: Record<string, string | undefined>;
  runner?: CommandRunner;
}

interface OpencodeConfig {
  bin: string;
  model?: string;
  agent?: string;
  attach?: string;
  dir?: string;
  modelsProvider?: string;
  timeoutMs: number;
}

export function createOpencodeProvider(options: OpencodeProviderOptions = {}): AgentProviderAdapter {
  const env = options.env ?? process.env;
  const runner = options.runner ?? runCommand;

  return {
  id: "opencode",
  displayName: "OpenCode",
  capabilities: { chat: true },

  getRequiredEnv() {
    return [
      { key: "OPENCODE_BIN", required: false },
      { key: "OPENCODE_MODEL", required: false },
      { key: "OPENCODE_AGENT", required: false },
      { key: "OPENCODE_ATTACH", required: false },
      { key: "OPENCODE_DIR", required: false },
      { key: "OPENCODE_MODELS_PROVIDER", required: false },
      { key: "OPENCODE_TIMEOUT_MS", required: false },
    ];
  },

  validateEnv(candidateEnv) {
    resolveConfig(candidateEnv);
  },

  async listModels() {
    const config = resolveConfig(env);
    const args = ["models"];
    if (config.modelsProvider) args.push(config.modelsProvider);
    const result = await runOpencode(config, runner, args, env);
    return parseModels(result.stdout);
  },

  async chat(req) {
    const config = resolveConfig(env);
    const prompt = renderPrompt(req.messages);
    if (!prompt) {
      throw new AgentProviderConfigError("opencode.chat requires at least one message with content");
    }

    const args = ["run"];
    if (config.model) args.push("--model", config.model);
    if (config.agent) args.push("--agent", config.agent);
    if (config.attach) args.push("--attach", config.attach);
    if (config.dir) args.push("--dir", config.dir);
    args.push(prompt);

    const result = await runOpencode(config, runner, args, env);
    const content = result.stdout.trim();
    if (!content) throw new AgentProviderRequestError("OpenCode CLI returned an empty response");
    return { content };
  },

  async healthcheck() {
    const config = resolveConfig(env);
    const result = await runOpencode(config, runner, ["--version"], env);
    return { ok: true, message: result.stdout.trim() || "opencode available" };
  },
};
}

export const opencodeProvider = createOpencodeProvider();

function resolveConfig(env: Record<string, string | undefined>): OpencodeConfig {
  const timeoutMs = parseTimeout(env.OPENCODE_TIMEOUT_MS);
  return {
    bin: env.OPENCODE_BIN?.trim() || "opencode",
    model: nonEmpty(env.OPENCODE_MODEL),
    agent: nonEmpty(env.OPENCODE_AGENT),
    attach: nonEmpty(env.OPENCODE_ATTACH),
    dir: nonEmpty(env.OPENCODE_DIR),
    modelsProvider: nonEmpty(env.OPENCODE_MODELS_PROVIDER),
    timeoutMs,
  };
}

function parseTimeout(value: string | undefined): number {
  if (!value) return 120_000;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AgentProviderConfigError("OPENCODE_TIMEOUT_MS must be a positive integer");
  }
  return parsed;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function renderPrompt(messages: { role: string; content: string }[]): string {
  return messages
    .map((message) => {
      const content = message.content.trim();
      if (!content) return "";
      return `${message.role.toUpperCase()}:\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

async function runOpencode(
  config: OpencodeConfig,
  runner: CommandRunner,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<CommandResult> {
  try {
    const result = await runner(config.bin, args, {
      cwd: config.dir,
      env: { ...process.env, ...env },
      timeoutMs: config.timeoutMs,
    });
    if (result.exitCode !== 0) {
      const detail = formatFailure(result, env);
      throw new AgentProviderRequestError(`OpenCode CLI exited ${result.exitCode}${detail}`);
    }
    return result;
  } catch (error) {
    if (error instanceof AgentProviderRequestError) throw error;
    const result = commandErrorResult(error);
    const detail = formatFailure(result, env);
    throw new AgentProviderRequestError(`OpenCode CLI failed${detail}`);
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: CommandRunnerOptions,
): Promise<CommandResult> {
  const result = await execFileAsync(resolveExecutable(command), args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    exitCode: 0,
  };
}

function resolveExecutable(command: string): string {
  if (process.platform !== "win32") return command;
  if (/[\\/]/.test(command) || /\.(?:bat|cmd|exe)$/i.test(command)) return command;
  return `${command}.cmd`;
}

function commandErrorResult(error: unknown): CommandResult {
  const candidate = error as { stdout?: unknown; stderr?: unknown; code?: unknown };
  return {
    stdout: String(candidate.stdout ?? ""),
    stderr: String(candidate.stderr ?? ""),
    exitCode: typeof candidate.code === "number" ? candidate.code : 1,
  };
}

function formatFailure(result: CommandResult, env: Record<string, string | undefined>): string {
  const text = sanitizeCliOutput([result.stderr, result.stdout].filter(Boolean).join("\n"), env);
  return text ? `: ${text}` : "";
}

function sanitizeCliOutput(text: string, env: Record<string, string | undefined>): string {
  let sanitized = text.replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]");
  for (const key of ["OPENCODE_SERVER_PASSWORD", "OPENCODE_API_KEY"]) {
    const value = env[key];
    if (value && value.length >= 4) {
      sanitized = sanitized.split(value).join("[redacted]");
    }
  }
  return sanitized.trim().slice(0, 1000);
}

function parseModels(stdout: string): string[] {
  const models = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const matches = line.matchAll(/\b[a-z0-9][a-z0-9_.-]*\/[a-zA-Z0-9][a-zA-Z0-9_.:/+-]*/g);
    for (const match of matches) models.add(match[0]);
  }
  return [...models].sort();
}
