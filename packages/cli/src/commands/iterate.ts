import { Command } from 'commander';
import kleur from 'kleur';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { configDir } from '@profullstack/sh1pt-core';
import { describeInput, resolveInput } from '../input.js';

// agentsCmd moved to root level — see https://github.com/profullstack/sh1pt/issues/235

const GOALS_FILE = () => path.join(configDir(), 'iterate-goals.json');
const EXPERIMENTS_FILE = () => path.join(configDir(), 'iterate-experiments.json');

// ---------------------------------------------------------------------------
// Experiment types & persistence
// ---------------------------------------------------------------------------

export interface Experiment {
  id: string;
  hypothesis: string;
  variants: string[];
  traffic: number;
  minSample: number;
  status: 'active' | 'paused' | 'ended';
  winner?: 'A' | 'B' | 'inconclusive';
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentState {
  experiments: Experiment[];
}

async function loadExperiments(): Promise<ExperimentState> {
  try {
    const raw = await fs.readFile(EXPERIMENTS_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.experiments)
      ? parsed
      : { experiments: [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { experiments: [] };
    throw err;
  }
}

async function saveExperiments(state: ExperimentState): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const tmp = `${EXPERIMENTS_FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, EXPERIMENTS_FILE());
}

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

// AI-CLI agents moved to root level — see #235.
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
  .option('--cloud', 'schedule and run the watch loop in sh1pt cloud')
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
  .option('--variant <text...>', 'the B-side change; A is current state (may be specified multiple times)')
  .option('--traffic <percent>', 'percentage routed to B', Number, 50)
  .option('--min-sample <n>', 'minimum events before stopping', Number, 1000)
  .action(async (hypothesis: string, opts: { variant?: string[]; traffic: number; minSample: number }) => {
    const state = await loadExperiments();
    const id = randomBytes(4).toString('hex');
    const now = new Date().toISOString();
    const experiment: Experiment = {
      id,
      hypothesis,
      variants: opts.variant ?? [],
      traffic: opts.traffic,
      minSample: opts.minSample,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    state.experiments.push(experiment);
    await saveExperiments(state);

    console.log(kleur.green(`experiment created: ${kleur.bold(id)}`));
    console.log(`  ${kleur.cyan('hypothesis'.padEnd(12))}: ${hypothesis}`);
    if (experiment.variants.length > 0) {
      console.log(`  ${kleur.cyan('variant(s)'.padEnd(12))}: ${experiment.variants.join(', ')}`);
    }
    console.log(`  ${kleur.cyan('traffic'.padEnd(12))}: ${opts.traffic}% to B`);
    console.log(`  ${kleur.cyan('min-sample'.padEnd(12))}: ${opts.minSample}`);
    console.log(kleur.dim(`  run \`sh1pt iterate experiments\` to track progress`));
  });

iterateCmd
  .command('experiments')
  .description('Active and recently-ended experiments with significance')
  .option('--json', 'machine-readable output grouped by status')
  .option('--end <id>', 'mark an experiment as ended')
  .option('--pause <id>', 'pause a running experiment')
  .option('--resume <id>', 'resume a paused experiment')
  .option('--winner <result>', 'A | B | inconclusive (use with --end)')
  .option('--note <text>', 'free-form note recorded on status change')
  .action(async (opts: {
    json?: boolean;
    end?: string;
    pause?: string;
    resume?: string;
    winner?: string;
    note?: string;
  }) => {
    const state = await loadExperiments();

    // Mutations
    const mutateId = opts.end ?? opts.pause ?? opts.resume;
    if (mutateId) {
      const exp = state.experiments.find(e => e.id === mutateId);
      if (!exp) {
        console.error(kleur.red(`experiment "${mutateId}" not found`));
        process.exit(1);
      }
      if (opts.end) {
        exp.status = 'ended';
        if (opts.winner) {
          const validWinners = ['A', 'B', 'inconclusive'] as const;
          if (!(validWinners as readonly string[]).includes(opts.winner)) {
            console.error(kleur.red(`invalid --winner "${opts.winner}" — must be A, B, or inconclusive`));
            process.exit(1);
          }
          exp.winner = opts.winner as 'A' | 'B' | 'inconclusive';
        }
        if (opts.note) exp.note = opts.note;
        exp.updatedAt = new Date().toISOString();
        console.log(kleur.yellow(`ended: ${exp.id}${opts.winner ? ` · winner=${opts.winner}` : ''}`));
      } else if (opts.pause) {
        exp.status = 'paused';
        if (opts.note) exp.note = opts.note;
        exp.updatedAt = new Date().toISOString();
        console.log(kleur.yellow(`paused: ${exp.id}`));
      } else if (opts.resume) {
        exp.status = 'active';
        if (opts.note) exp.note = opts.note;
        exp.updatedAt = new Date().toISOString();
        console.log(kleur.green(`resumed: ${exp.id}`));
      }
      await saveExperiments(state);
      return;
    }

    // Display
    const active  = state.experiments.filter(e => e.status === 'active');
    const paused  = state.experiments.filter(e => e.status === 'paused');
    const ended   = state.experiments.filter(e => e.status === 'ended');

    if (opts.json) {
      console.log(JSON.stringify({ active, paused, ended }, null, 2));
      return;
    }

    if (state.experiments.length === 0) {
      console.log(kleur.dim('no experiments yet — run `sh1pt iterate test "<hypothesis>"` to create one'));
      return;
    }

    function printGroup(label: string, items: Experiment[]): void {
      if (items.length === 0) return;
      console.log(kleur.bold(`\n${label}`));
      for (const e of items) {
        console.log(`  ${kleur.cyan(e.id)}  ${e.status}`);
        console.log(`    ${e.hypothesis}`);
        if (e.variants.length > 0) {
          console.log(kleur.dim(`    variants: ${e.variants.join(', ')}`));
        }
        if (e.winner) console.log(kleur.dim(`    winner: ${e.winner}`));
        if (e.note)   console.log(kleur.dim(`    note: ${e.note}`));
      }
    }

    printGroup('Active', active);
    printGroup('Paused', paused);
    printGroup('Ended',  ended);

    const total = state.experiments.length;
    console.log(kleur.dim(`\n${active.length} active / ${total} total`));
  });
