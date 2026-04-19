import { defineAgent, exec, ensureCli } from '@sh1pt/core';

interface Config {
  model?: string;            // 'gpt-5', 'o1', etc.
  approvalMode?: 'auto-edit' | 'full-auto' | 'suggest';
}

export default defineAgent<Config>({
  id: 'agent-codex',
  label: 'OpenAI Codex CLI',
  binary: 'codex',
  capabilities: ['generate-project', 'edit-files', 'run-commands', 'multi-turn', 'tool-use'],

  async check() {
    try {
      const result = await exec('codex', ['--version'], { log: () => {}, throwOnNonZero: false });
      return {
        installed: result.exitCode === 0,
        version: result.stdout.trim() || undefined,
        authenticated: true, // real impl: check ~/.codex/auth
        installHint: 'npm install -g @openai/codex',
      };
    } catch {
      return {
        installed: false,
        authenticated: false,
        installHint: 'npm install -g @openai/codex',
        authHint: 'run `codex auth login` after install',
      };
    }
  },

  async run(ctx, config) {
    await ensureCli('codex', 'Install: npm install -g @openai/codex', ctx.log);
    const args = [
      ...(config.approvalMode ? ['--approval-mode', config.approvalMode] : []),
      ...(config.model ? ['--model', config.model] : []),
      ctx.prompt,
    ];
    ctx.log(`codex ${args.join(' ')}`);
    const { exitCode } = await exec('codex', args, { cwd: ctx.cwd, log: ctx.log });
    return { exitCode };
  },
});
