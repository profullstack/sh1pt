// AI API provider abstraction. Distinct from `agent.ts` (which wraps
// installed CLI binaries like `claude` / `codex` / `qwen`) — this is for
// HTTP-API-based content generation: ad copy, social post bodies,
// taglines, image prompts, anything `sh1pt promote` needs to draft.
//
// Adapters use defineAi() to pick up auto-stub-setup. The standard
// shape is one tokenSetup() per provider (every major LLM uses static
// API keys; OAuth-based access is rare and usually limited).

import { autoSetup } from './setup-helpers.js';

export interface AiContext {
  secret(key: string): string | undefined;
  log(m: string): void;
  dryRun?: boolean;
}

export interface AiGenerateOpts {
  model?: string;            // override the provider default
  system?: string;           // system prompt
  maxTokens?: number;
  temperature?: number;
  // Free-form passthrough for provider-specific knobs (top_p, json_mode,
  // stop sequences, etc.). Adapters ignore unknown keys.
  extra?: Record<string, unknown>;
}

export interface AiResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiProvider<Config = unknown> {
  id: string;                          // e.g. 'ai-claude'
  label: string;
  defaultModel: string;
  // Optional list of supported model IDs — useful for `sh1pt promote ai
  // models` and validation. Adapters may accept other IDs at runtime.
  models?: string[];
  generate(ctx: AiContext, prompt: string, opts: AiGenerateOpts, config: Config): Promise<AiResult>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineAi<Config>(p: AiProvider<Config>): AiProvider<Config> {
  return autoSetup(p);
}

const aiRegistry = new Map<string, AiProvider<any>>();

export function registerAi(p: AiProvider<any>): void {
  if (aiRegistry.has(p.id)) throw new Error(`AI provider already registered: ${p.id}`);
  aiRegistry.set(p.id, p);
}

export function getAi(id: string): AiProvider<any> | undefined {
  return aiRegistry.get(id);
}

export function listAi(): AiProvider<any>[] {
  return [...aiRegistry.values()];
}
