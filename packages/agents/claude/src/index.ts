import { defineAgent, exec, ensureCli } from '@profullstack/sh1pt-core';

interface Config {
  model?: string;            // e.g. 'claude-opus-4-7', 'claude-sonnet-4-6'
  maxTurns?: number;
}

export default defineAgent<Config>({
  id: 'agent-claude',
  label: 'Claude Code (Anthropic)',
  binary: 'claude',
  capabilities: ['generate-project', 'edit-files', 'run-commands', 'multi-turn', 'tool-use'],

  async check(ctx) {
    try {
      const result = await exec('claude', ['--version'], { log: () => {}, throwOnNonZero: false });
      const version = result.stdout.trim() || undefined;
      return {
        installed: result.exitCode === 0,
        version,
        authenticated: true, // real impl: `claude --check-auth` or similar
        installHint: 'npm install -g @anthropic-ai/claude-code',
      };
    } catch {
      return {
        installed: false,
        authenticated: false,
        installHint: 'npm install -g @anthropic-ai/claude-code',
        authHint: 'run `claude /login` after install',
      };
    }
  },

  async run(ctx, config) {
    await ensureCli('claude', 'Install: npm install -g @anthropic-ai/claude-code', ctx.log);
    const args = [
      '-p', ctx.prompt,
      ...(config.model ? ['--model', config.model] : []),
      ...(ctx.files?.flatMap((f) => ['--add-file', f]) ?? []),
    ];
    ctx.log(`claude ${args.join(' ')}`);
    const { exitCode } = await exec('claude', args, { cwd: ctx.cwd, log: ctx.log });
    return { exitCode };
  },
});
