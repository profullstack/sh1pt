import { Command } from 'commander';
import kleur from 'kleur';

export const agentsCmd = new Command('agents')
  .description('Orchestrate AI coding CLIs (Claude Code, Codex, Qwen) — generate, edit, and talk')
  .action(() => {
    agentsCmd.help();
  });

agentsCmd
  .command('list')
  .description('Which agent CLIs are installed on this machine')
  .action(() => {
    const agents = ['claude', 'codex', 'qwen'];
    for (const a of agents) {
      // TODO: resolve adapter, call check(), render real status
      console.log(`  ${kleur.gray('○')} ${kleur.bold(a)}  ${kleur.dim('run `sh1pt agents setup --agent ' + a + '`')}`);
    }
  });

agentsCmd
  .command('setup')
  .description('Install and authenticate the agent CLI(s) you want sh1pt to drive')
  .option('--agent <id...>', 'e.g. --agent claude codex qwen (default: all three)')
  .action((opts: { agent?: string[] }) => {
    const picks = opts.agent ?? ['claude', 'codex', 'qwen'];
    for (const id of picks) {
      console.log(kleur.cyan(`[stub] agents setup ${id} — resolve adapter, run check(), print installHint / authHint`));
    }
  });

agentsCmd
  .command('run <agent>')
  .description('Fire a one-shot prompt at a specific agent')
  .argument('<prompt...>', 'the prompt text')
  .option('--files <path...>', 'files the agent should focus on')
  .option('--model <id>')
  .action((agent: string, prompt: string[], opts: { files?: string[]; model?: string }) => {
    console.log(kleur.green(`[stub] ${agent} run ${kleur.dim(`· model=${opts.model ?? 'default'}`)}`));
    console.log(kleur.dim(`prompt: ${prompt.join(' ')}`));
    // TODO: resolve adapter, build AgentRunContext, call run()
  });

agentsCmd
  .command('talk [agent]')
  .description('Start an interactive session with an agent (the app-generation fast path)')
  .option('--recipe <id>', 'pre-load a recipe prompt (e.g. waitlist-crypto-investor)')
  .action((agent: string = 'claude', opts: { recipe?: string }) => {
    console.log(kleur.bold(`sh1pt talk → ${agent}${opts.recipe ? ` (recipe: ${opts.recipe})` : ''}`));
    console.log(kleur.dim('[stub] attaches stdio to the agent CLI. Ctrl-D to exit.'));
    if (opts.recipe) {
      console.log(kleur.dim(`would preload: packages/recipes/${opts.recipe}/src/index.ts → prompts[<boilerplate>]`));
    }
    // TODO: spawn agent binary with inherited stdio, optionally pipe recipe.prompts[<boilerplate>] as initial message
  });

agentsCmd
  .command('generate')
  .description('Generate a new project from a recipe using the chosen agent (one-shot, non-interactive)')
  .option('--agent <id>', 'claude | codex | qwen', 'claude')
  .option('--recipe <id>', 'e.g. waitlist-crypto-investor', 'waitlist-crypto-investor')
  .option('--boilerplate <id>', 'next-supabase | expo-supabase | tauri-supabase | chrome-ext-react | bun-hono-supabase', 'next-supabase')
  .option('--out <dir>', 'output directory', './generated')
  .action((opts) => {
    console.log(kleur.green(`[stub] agents generate`), kleur.dim(JSON.stringify(opts)));
    // TODO: copy boilerplate to opts.out, render recipe.prompts[opts.boilerplate],
    // invoke AgentCLI.run() with the rendered prompt against the copied dir
  });
