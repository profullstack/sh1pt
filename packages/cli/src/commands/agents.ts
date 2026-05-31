import { Command } from 'commander';
import kleur from 'kleur';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Known agent CLI descriptors
// ---------------------------------------------------------------------------

interface AgentDescriptor {
  id: string;
  binary: string;
  versionArgs: string[];
  installHint: string;
  package: string;
}

const KNOWN_AGENTS: AgentDescriptor[] = [
  {
    id: 'claude',
    binary: 'claude',
    versionArgs: ['--version'],
    installHint: 'npm install -g @anthropic-ai/claude-code',
    package: '@anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    binary: 'codex',
    versionArgs: ['--version'],
    installHint: 'npm install -g @openai/codex',
    package: '@openai/codex',
  },
  {
    id: 'qwen',
    binary: 'qwen',
    versionArgs: ['--version'],
    installHint: 'pip install qwen-agent',
    package: 'qwen-agent',
  },
];

interface AgentStatus {
  id: string;
  installed: boolean;
  version?: string;
  binary: string;
  installHint: string;
  package: string;
  setupCommand: string;
}

/** Probe a single agent binary, returning install status and version string. */
function probeAgent(desc: AgentDescriptor): AgentStatus {
  const result = spawnSync(desc.binary, desc.versionArgs, {
    timeout: 5000,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    return {
      id: desc.id,
      installed: false,
      binary: desc.binary,
      installHint: desc.installHint,
      package: desc.package,
      setupCommand: `sh1pt agents setup --agent ${desc.id}`,
    };
  }

  const raw = (result.stdout ?? result.stderr ?? '').trim();
  // Extract semver-ish version from output like "claude 1.2.3" or "v1.2.3"
  const match = raw.match(/v?(\d+\.\d+(?:\.\d+)?(?:[-+][^\s]*)?)/);
  const version = match ? match[1] : raw.split('\n')[0]?.trim();

  return {
    id: desc.id,
    installed: true,
    version,
    binary: desc.binary,
    installHint: desc.installHint,
    package: desc.package,
    setupCommand: `sh1pt agents setup --agent ${desc.id}`,
  };
}

export const agentsCmd = new Command('agents')
  .description('Orchestrate AI coding CLIs (Claude Code, Codex, Qwen) — generate, edit, and talk')
  .action(() => {
    agentsCmd.help();
  });

agentsCmd
  .command('list')
  .description('Which agent CLIs are installed on this machine')
  .option('--json', 'output as JSON')
  .action((opts: { json?: boolean }) => {
    const statuses = KNOWN_AGENTS.map(probeAgent);

    if (opts.json) {
      console.log(JSON.stringify(statuses, null, 2));
      return;
    }

    for (const s of statuses) {
      if (s.installed) {
        console.log(
          `  ${kleur.green('●')} ${kleur.bold(s.id).padEnd(8)} ${kleur.green(`v${s.version ?? 'unknown'}`)}`,
        );
      } else {
        console.log(
          `  ${kleur.gray('○')} ${kleur.bold(s.id).padEnd(8)} ${kleur.dim(`not installed — ${s.installHint}`)}`,
        );
      }
    }

    const installed = statuses.filter((s) => s.installed).length;
    const total = statuses.length;
    console.log();
    if (installed === total) {
      console.log(kleur.green(`${installed}/${total} agent(s) installed.`));
    } else {
      console.log(
        kleur.dim(`${installed}/${total} agent(s) installed.`) +
          ' ' +
          kleur.cyan('Run `sh1pt agents setup` to install missing agents.'),
      );
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
