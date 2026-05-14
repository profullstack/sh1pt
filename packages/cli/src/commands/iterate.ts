import { Command } from 'commander';
import kleur from 'kleur';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from '@profullstack/sh1pt-core';
import { describeInput, resolveInput } from '../input.js';
import { agentsCmd } from './agents.js';

const GOALS_FILE = () => path.join(configDir(), 'iterate-goals.json');

async function loadGoals(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(GOALS_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function saveGoals(goals: Record<string, string>): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const tmp = `${GOALS_FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(goals, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, GOALS_FILE());
}

export const iterateCmd = new Command('iterate')
  .description('Observe metrics, have an agent propose changes, ship, measure. Powered by Claude / Codex / Qwen.')
  .option('--from <input>', 'existing live url, repo, or local path to start observing + iterating on')
  .action((opts: { from?: string }) => {
    if (opts.from) {
      const input = resolveInput(opts.from);
      console.log(kleur.cyan(`[stub] iterate attach · from=${describeInput(input)}`));
      // TODO: kind==='url' → uptime/latency/Lighthouse baseline, seed observation loop;
      // kind==='git' → clone, read last N commits + CI signals, hook up an agent;
      // kind==='path'/'doc' → read local manifest and attach the metric sources it declares.
      return;
    }
    iterateCmd.help();
  });

// AI-CLI orchestration lives under iterate (was top-level `sh1pt agents`).
// sh1pt iterate agents [list|setup|talk|run|generate]
iterateCmd.addCommand(agentsCmd);

iterateCmd
  .command('run')
  .description('Single-shot cycle: pull metrics → have agent propose changes → apply (with confirmation) → ship')
  .option('--agent <id>', 'claude | codex | qwen', 'claude')
  .option('--scope <area>', 'copy | pricing | onboarding | perf | bugs | all', 'all')
  .option('--auto-apply', 'skip confirmation and apply agent changes directly (dangerous — pair with --max-files)')
  .option('--max-files <n>', 'hard cap on files the agent may touch', Number, 5)
  .action((opts) => {
    console.log(kleur.cyan(`[stub] iterate run ${JSON.stringify(opts)}`));
    // TODO:
    //  1. Pull last-window metrics: installs, signup conversion, ad CPI, churn, error rates
    //  2. Pull recent user feedback (waitlist survey, reviews, support tickets)
    //  3. Build a prompt: "here are our goals, here's what's happening, propose 1-3 changes"
    //  4. Feed prompt to agent, capture diff
    //  5. Either auto-apply or show diff + prompt user
    //  6. If applied: `sh1pt build && sh1pt ship --channel beta`
  });

iterateCmd
  .command('watch')
  .description('Daemon mode — run a cycle on every significant metric change')
  .option('--agent <id>', 'claude | codex | qwen', 'claude')
  .option('--interval <seconds>', 're-check interval', Number, 3600)
  .option('--quiet-hours <start-end>', 'e.g. 22-08 (24h local) to pause overnight')
  .action((opts) => {
    console.log(kleur.cyan(`[stub] iterate watch ${JSON.stringify(opts)}`));
    // TODO: long-running process hitting cloud API for fresh metrics every interval,
    // invoking `iterate run` when a configured threshold trips.
  });

iterateCmd
  .command('goals')
  .description('Declare the success metrics iterate steers toward')
  .argument('[kv...]', 'e.g. conversion=8% cpi=2.00 churn=5%')
  .option('--clear', 'remove all saved goals')
  .option('--unset <key>', 'remove a single goal by key')
  .option('--json', 'machine-readable output')
  .action(async (kv: string[], opts: { clear?: boolean; unset?: string; json?: boolean }) => {
    const goals = await loadGoals();

    if (opts.clear) {
      await saveGoals({});
      console.log(kleur.yellow('all goals cleared'));
      return;
    }

    if (opts.unset) {
      if (opts.unset in goals) {
        delete goals[opts.unset];
        await saveGoals(goals);
        console.log(kleur.yellow(`unset: ${opts.unset}`));
      } else {
        console.log(kleur.dim(`goal "${opts.unset}" not set`));
      }
      return;
    }

    if (kv.length === 0) {
      if (Object.keys(goals).length === 0) {
        console.log(kleur.dim('no goals set — pass key=value pairs to set them'));
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(goals, null, 2));
        return;
      }
      console.log(kleur.bold('current goals:'));
      for (const [k, v] of Object.entries(goals)) {
        console.log(`  ${kleur.cyan(k)} = ${v}`);
      }
      return;
    }

    for (const pair of kv) {
      const idx = pair.indexOf('=');
      if (idx === -1) {
        console.error(kleur.red(`invalid goal "${pair}" — expected key=value`));
        continue;
      }
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!key) { console.error(kleur.red(`empty key in "${pair}"`)); continue; }
      goals[key] = value;
      console.log(kleur.green(`  set ${key} = ${value}`));
    }
    await saveGoals(goals);
  });

iterateCmd
  .command('test <hypothesis>')
  .description('Spawn an A/B experiment around a hypothesis and register auto-analysis')
  .option('--variant <text...>', 'the B-side change; A is current state')
  .option('--traffic <percent>', 'percentage routed to B', Number, 50)
  .option('--min-sample <n>', 'minimum events before stopping', Number, 1000)
  .action((hypothesis: string, opts) => {
    console.log(kleur.cyan(`[stub] iterate test "${hypothesis}" ${JSON.stringify(opts)}`));
    // TODO: generate two Ship variants, wire feature flag, schedule analysis at min-sample
  });

iterateCmd
  .command('experiments')
  .description('Active and recently-ended experiments with significance')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ active: [], ended: [] }, null, 2)); return; }
    console.log(kleur.dim('[stub] iterate experiments — table of active / concluded tests'));
  });
