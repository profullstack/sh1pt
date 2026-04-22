import { defineAgent, exec, ensureCli } from '@profullstack/sh1pt-core';

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
        installHint: 'npm install -g @qwen-code/qwen-code',
      };
    } catch {
      return {
        installed: false,
        authenticated: false,
        installHint: 'npm install -g @qwen-code/qwen-code',
        authHint: 'set DASHSCOPE_API_KEY env var (Alibaba DashScope console)',
      };
    }
  },

  async run(ctx, config) {
    await ensureCli('qwen', 'Install: npm install -g @qwen-code/qwen-code', ctx.log);
    const args = [
      ...(config.model ? ['--model', config.model] : []),
      '--prompt', ctx.prompt,
    ];
    const { exitCode } = await exec('qwen', args, { cwd: ctx.cwd, log: ctx.log });
    return { exitCode };
  },
});
