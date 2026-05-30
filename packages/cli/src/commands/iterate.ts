import { Command } from 'commander';
import kleur from 'kleur';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { configDir } from '@profullstack/sh1pt-core';
import { describeInput, resolveInput } from '../input.js';

// agentsCmd moved to root level — see https://github.com/profullstack/sh1pt/issues/235

const GOALS_FILE = () => path.join(configDir(), 'iterate-goals.json');

// ---------------------------------------------------------------------------
// Experiments persistence
// ---------------------------------------------------------------------------

interface Experiment {
  id: string;
  hypothesis: string;
  variants: string[];
  traffic: number;
  minSample: number;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'ended' | 'paused';
  significance?: number;
  sampleCount?: number;
  winner?: 'A' | 'B' | 'inconclusive';
  note?: string;
}

const EXPERIMENTS_FILE = () => path.join(configDir(), 'iterate-experiments.json');

async function loadExperiments(): Promise<Experiment[]> {
  try {
    const raw = await fs.readFile(EXPERIMENTS_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function saveExperiments(experiments: Experiment[]): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const tmp = `${EXPERIMENTS_FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(experiments, null, 2) + '\n', { mode: 0o600 });
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
  .option('--variant <text...>', 'the B-side change; A is current state')
  .option('--traffic <percent>', 'percentage routed to B', Number, 50)
  .option('--min-sample <n>', 'minimum events before stopping', Number, 1000)
  .action(async (hypothesis: string, opts: { variant?: string[]; traffic?: number; minSample?: number }) => {
    const experiments = await loadExperiments();
    const now = new Date().toISOString();
    const id = randomBytes(4).toString('hex');
    const experiment: Experiment = {
      id,
      hypothesis,
      variants: opts.variant ?? [],
      traffic: opts.traffic ?? 50,
      minSample: opts.minSample ?? 1000,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    };
    experiments.push(experiment);
    await saveExperiments(experiments);
    console.log(kleur.green(`experiment created: ${kleur.bold(id)}`));
    console.log(`  hypothesis : ${hypothesis}`);
    if (experiment.variants.length > 0) {
      console.log(`  variant(s) : ${experiment.variants.join(', ')}`);
    }
    console.log(`  traffic    : ${experiment.traffic}% to B`);
    console.log(`  min-sample : ${experiment.minSample}`);
    console.log(kleur.dim(`  run \`sh1pt iterate experiments\` to track progress`));
  });

const experimentsCmd = iterateCmd
  .command('experiments')
  .description('Active and recently-ended experiments with significance')
  .option('--json', 'machine-readable output')
  .option('--end <id>', 'mark an experiment as ended')
  .option('--pause <id>', 'pause an active experiment')
  .option('--resume <id>', 'resume a paused experiment')
  .option('--winner <result>', 'record outcome when ending (A | B | inconclusive)')
  .option('--note <text>', 'attach a note when ending')
  .action(async (opts: {
    json?: boolean;
    end?: string;
    pause?: string;
    resume?: string;
    winner?: 'A' | 'B' | 'inconclusive';
    note?: string;
  }) => {
    const experiments = await loadExperiments();
    const now = new Date().toISOString();

    // Mutating actions
    if (opts.end) {
      const exp = experiments.find(e => e.id === opts.end);
      if (!exp) { console.error(kleur.red(`experiment "${opts.end}" not found`)); process.exit(1); }
      exp.status = 'ended';
      exp.updatedAt = now;
      if (opts.winner) exp.winner = opts.winner;
      if (opts.note) exp.note = opts.note;
      await saveExperiments(experiments);
      console.log(kleur.yellow(`ended: ${opts.end}`) + (opts.winner ? kleur.dim(` · winner=${opts.winner}`) : ''));
      return;
    }

    if (opts.pause) {
      const exp = experiments.find(e => e.id === opts.pause);
      if (!exp) { console.error(kleur.red(`experiment "${opts.pause}" not found`)); process.exit(1); }
      exp.status = 'paused';
      exp.updatedAt = now;
      await saveExperiments(experiments);
      console.log(kleur.yellow(`paused: ${opts.pause}`));
      return;
    }

    if (opts.resume) {
      const exp = experiments.find(e => e.id === opts.resume);
      if (!exp) { console.error(kleur.red(`experiment "${opts.resume}" not found`)); process.exit(1); }
      exp.status = 'active';
      exp.updatedAt = now;
      await saveExperiments(experiments);
      console.log(kleur.green(`resumed: ${opts.resume}`));
      return;
    }

    // List
    if (opts.json) {
      const active = experiments.filter(e => e.status === 'active');
      const ended = experiments.filter(e => e.status === 'ended');
      const paused = experiments.filter(e => e.status === 'paused');
      console.log(JSON.stringify({ active, paused, ended }, null, 2));
      return;
    }

    if (experiments.length === 0) {
      console.log(kleur.dim('no experiments — run `sh1pt iterate test "<hypothesis>"` to start one'));
      return;
    }

    const statusColor = (s: Experiment['status']) =>
      s === 'active' ? kleur.green(s) : s === 'paused' ? kleur.yellow(s) : kleur.dim(s);

    for (const exp of experiments) {
      const winner = exp.winner ? kleur.cyan(` winner=${exp.winner}`) : '';
      const sig = exp.significance != null ? kleur.dim(` sig=${exp.significance}`) : '';
      const samples = exp.sampleCount != null ? kleur.dim(` n=${exp.sampleCount}`) : '';
      console.log(`${kleur.bold(exp.id)}  ${statusColor(exp.status)}${winner}${sig}${samples}`);
      console.log(`  ${exp.hypothesis}`);
      if (exp.variants.length > 0) console.log(`  ${kleur.dim('variants:')} ${exp.variants.join(', ')}`);
      if (exp.note) console.log(`  ${kleur.dim('note:')} ${exp.note}`);
    }

    const active = experiments.filter(e => e.status === 'active').length;
    console.log(kleur.dim(`\n${active} active / ${experiments.length} total`));
  });
