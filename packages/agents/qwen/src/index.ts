import { defineAgent, exec, ensureCli, manualSetup, type AgentRunContext } from '@profullstack/sh1pt-core';

interface Config {
  model?: string;            // 'qwen2.5-coder', 'qwen3-coder', etc.
  authType?: 'openai' | 'anthropic' | 'gemini' | 'qwen-oauth';
  authEnvKey?: string;       // defaults to common Qwen Code headless env vars
}

const DEFAULT_AUTH_ENV_KEYS = [
  'OPENAI_API_KEY',
  'DASHSCOPE_API_KEY',
  'QWEN_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
];

export default defineAgent<Config>({
  id: 'agent-qwen',
  label: 'Qwen Code (Alibaba)',
  binary: 'qwen',
  capabilities: ['generate-project', 'edit-files', 'run-commands', 'multi-turn'],

  async check(_ctx, config) {
    try {
      const result = await exec('qwen', ['--version'], { log: () => {}, throwOnNonZero: false });
      const authenticated = hasHeadlessAuth(config, process.env);
      return {
        installed: result.exitCode === 0,
        version: result.stdout.trim() || undefined,
        authenticated,
        installHint: 'mise use npm:@qwen-code/qwen-code',
        authHint: authenticated ? undefined : headlessAuthHint(config),
      };
    } catch {
      return {
        installed: false,
        authenticated: false,
        installHint: 'mise use npm:@qwen-code/qwen-code',
        authHint: headlessAuthHint(config),
      };
    }
  },

  async run(ctx, config) {
    await ensureCli('qwen', 'Install: mise use npm:@qwen-code/qwen-code', ctx.log);
    const args = qwenArgs(ctx, config);
    ctx.log(`qwen ${args.slice(0, -1).join(' ')} <prompt>`);
    const { exitCode } = await exec('qwen', args, { cwd: ctx.cwd, log: ctx.log });
    return { exitCode };
  },

  setup: manualSetup({
    label: "Qwen Code",
    vendorDocUrl: "https://qwenlm.github.io/qwen-code-docs/en/cli/index",
    steps: [
      "Install with mise: mise use npm:@qwen-code/qwen-code",
      "For headless sh1pt runs, set OPENAI_API_KEY plus optional OPENAI_BASE_URL / OPENAI_MODEL, or use the configured auth env key",
      "sh1pt invokes whichever qwen CLI is on your PATH",
    ],
  }),
});

export function qwenArgs(ctx: Pick<AgentRunContext, 'prompt' | 'files'>, config: Config): string[] {
  return [
    ...(config.authType ? ['--auth-type', config.authType] : []),
    ...(config.model ? ['--model', config.model] : []),
    '-p',
    qwenPrompt(ctx),
  ];
}

export function qwenPrompt(ctx: Pick<AgentRunContext, 'prompt' | 'files'>): string {
  if (!ctx.files?.length) return ctx.prompt;
  const fileRefs = ctx.files.map((file) => `@${file}`).join('\n');
  return `${ctx.prompt}\n\nRelevant files:\n${fileRefs}`;
}

export function hasHeadlessAuth(config: Config, env: Record<string, string | undefined>): boolean {
  const keys = config.authEnvKey ? [config.authEnvKey] : DEFAULT_AUTH_ENV_KEYS;
  return keys.some((key) => Boolean(env[key]?.trim()));
}

function headlessAuthHint(config: Config): string {
  if (config.authEnvKey) return `set ${config.authEnvKey} for Qwen Code headless runs`;
  return 'set OPENAI_API_KEY with optional OPENAI_BASE_URL / OPENAI_MODEL, or configure authEnvKey for another Qwen Code provider';
}
