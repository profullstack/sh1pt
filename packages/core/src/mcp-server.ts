import { spawn } from 'node:child_process';
import { autoSetup } from './setup-helpers.js';

export interface McpServerContext {
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
  secret(k: string): string | undefined;
  dryRun: boolean;
}

export interface McpToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolContent {
  type: string;
  text?: string;
  mimeType?: string;
  data?: unknown;
}

export interface McpToolResult {
  content?: McpToolContent[];
  isError?: boolean;
  raw?: unknown;
}

export interface StdioMcpConfig {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export interface StdioMcpDefaults {
  command?: string;
  args?: string[];
  env?: Record<string, string | undefined>;
  label?: string;
  timeoutMs?: number;
}

export interface McpServer<Config = unknown> {
  id: string;
  label: string;
  description?: string;
  defaultCommand?: string;
  defaultArgs?: string[];
  callTool(ctx: McpServerContext, call: McpToolCall, config: Config): Promise<McpToolResult>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineMcpServer<Config>(server: McpServer<Config>): McpServer<Config> {
  return autoSetup(server);
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export async function callStdioMcpTool(
  ctx: McpServerContext,
  call: McpToolCall,
  config: StdioMcpConfig,
  defaults: StdioMcpDefaults = {},
): Promise<McpToolResult> {
  const command = config.command ?? defaults.command;
  if (!command) {
    throw new Error('MCP server command not configured');
  }

  const args = config.args ?? defaults.args ?? [];
  const label = defaults.label ?? command;
  ctx.log(`mcp stdio - ${label} - tools/call ${call.name}`);

  if (ctx.dryRun) {
    return {
      content: [
        {
          type: 'text',
          text: `[dry-run] would call MCP tool ${call.name} via ${command} ${args.join(' ')}`.trim(),
        },
      ],
      raw: { dryRun: true, command, args, tool: call.name },
    };
  }

  const timeoutMs = config.timeoutMs ?? defaults.timeoutMs ?? 30_000;
  const child = spawn(command, args, {
    cwd: config.cwd,
    env: mergeEnv(defaults.env, config.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let nextId = 1;
  let stdoutBuffer = '';
  let stderrTail = '';
  const pending = new Map<number, {
    resolve(value: unknown): void;
    reject(reason?: unknown): void;
    timer: NodeJS.Timeout;
  }>();

  const rejectAll = (err: Error) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    pending.clear();
  };

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderrTail = `${stderrTail}${chunk}`.slice(-2_000);
    for (const line of chunk.split('\n')) {
      if (line.trim()) ctx.log(line.trim(), 'warn');
    }
  });

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf('\n');
    while (newline !== -1) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line) handleMessage(line);
      newline = stdoutBuffer.indexOf('\n');
    }
  });

  child.on('error', (err) => rejectAll(err));
  child.on('close', (code) => {
    if (pending.size > 0) {
      const detail = stderrTail.trim() ? `: ${stderrTail.trim().split('\n').pop()}` : '';
      rejectAll(new Error(`MCP server exited before responding (exit ${code ?? 'unknown'})${detail}`));
    }
  });

  const request = (method: string, params?: unknown): Promise<unknown> => {
    const id = nextId++;
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(msg)}\n`);
    });
  };

  const notify = (method: string, params?: unknown) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })}\n`);
  };

  function handleMessage(line: string) {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line) as JsonRpcResponse;
    } catch {
      ctx.log(`mcp stdio - ignored non-json stdout: ${line.slice(0, 120)}`, 'warn');
      return;
    }

    if (typeof msg.id !== 'number') {
      return;
    }

    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);

    if (msg.error) {
      entry.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
      return;
    }
    entry.resolve(msg.result);
  }

  try {
    await request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'sh1pt', version: '0.1.0' },
    });
    notify('notifications/initialized');
    const result = await request('tools/call', {
      name: call.name,
      arguments: call.arguments ?? {},
    });
    return normalizeToolResult(result);
  } finally {
    child.stdin.end();
    if (!child.killed) child.kill();
  }
}

function normalizeToolResult(result: unknown): McpToolResult {
  if (result && typeof result === 'object') {
    const r = result as McpToolResult;
    return {
      content: r.content,
      isError: r.isError,
      raw: result,
    };
  }
  return { raw: result };
}

function mergeEnv(
  defaults?: Record<string, string | undefined>,
  config?: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  const extra: Record<string, string> = {};
  for (const source of [defaults, config]) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) extra[key] = value;
    }
  }
  return { ...process.env, ...extra };
}
