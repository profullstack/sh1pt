import { defineAgent, exec, ensureCli, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  model?: string;            // 'qwen2.5-coder', 'qwen3-coder', etc.
}

export default defineAgent<Config>({
  id: 'agent-qwen',
  label: 'Qwen Code (Alibaba)',
  binary: 'qwen',
  capabilities: ['generate-project', 'edit-files', 'run-commands', 'multi-turn'],

  async check() {
    try {
      const result = await exec('qwen', ['--version'], { log: () => {}, throwOnNonZero: false });
      return {
        installed: result.exitCode === 0,
        version: result.stdout.trim() || undefined,
        authenticated: true, // real impl: check DashScope API key
        installHint: 'mise use npm:@qwen-code/qwen-code',
      };
    } catch {
      return {
        installed: false,
        authenticated: false,
        installHint: 'mise use npm:@qwen-code/qwen-code',
        authHint: 'set DASHSCOPE_API_KEY env var (Alibaba DashScope console)',
      };
    }
  },

  async run(ctx, config) {
    await ensureCli('qwen', 'Install: mise use npm:@qwen-code/qwen-code', ctx.log);
    const args = [
      ...(config.model ? ['--model', config.model] : []),
      '--prompt', ctx.prompt,
    ];
    const { exitCode } = await exec('qwen', args, { cwd: ctx.cwd, log: ctx.log });
    return { exitCode };
  },

  setup: manualSetup({
    label: "Qwen Code",
    vendorDocUrl: "https://github.com/QwenLM/Qwen-Agent",
    steps: [
      "Install with mise: mise use npm:@qwen-code/qwen-code",
      "sh1pt invokes whichever qwen CLI is on your PATH",
    ],
  }),
});
