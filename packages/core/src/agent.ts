// AI agent CLI orchestration. sh1pt wraps agent CLIs (Claude Code,
// Codex, Qwen, etc.) so one command can spawn an agent, hand it the
// sh1pt manifest + context, and let it generate/modify/ship code.

export type AgentCapability =
  | 'generate-project'      // can scaffold a new project from a prompt
  | 'edit-files'            // can modify existing files in place
  | 'run-commands'          // can execute shell commands
  | 'multi-turn'            // can maintain a back-and-forth conversation
  | 'tool-use';             // supports structured tool calls

export interface AgentRunContext {
  cwd: string;
  prompt: string;
  files?: string[];                    // files the agent should focus on
  interactive?: boolean;               // true = pipe stdio, false = capture output
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
}

export interface AgentInstallState {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  installHint: string;                 // what to run if not installed
  authHint?: string;                   // what to run if installed but not authed
}

export interface AgentCLI<Config = unknown> {
  id: string;                          // e.g. 'agent-claude'
  label: string;
  binary: string;                      // expected PATH entry (e.g. 'claude', 'codex', 'qwen')
  capabilities: AgentCapability[];
  check(ctx: { log: AgentRunContext['log'] }, config: Config): Promise<AgentInstallState>;
  run(ctx: AgentRunContext, config: Config): Promise<{ exitCode: number }>;
  generate?(ctx: AgentRunContext, config: Config): Promise<{ projectDir: string }>;
}

export function defineAgent<Config>(a: AgentCLI<Config>): AgentCLI<Config> {
  return a;
}

const agentRegistry = new Map<string, AgentCLI<any>>();

export function registerAgent(a: AgentCLI<any>): void {
  if (agentRegistry.has(a.id)) throw new Error(`Agent already registered: ${a.id}`);
  agentRegistry.set(a.id, a);
}

export function getAgent(id: string): AgentCLI<any> | undefined {
  return agentRegistry.get(id);
}

export function listAgents(): AgentCLI<any>[] {
  return [...agentRegistry.values()];
}
