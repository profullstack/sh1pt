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

export interface IterateExperiment {
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

export interface ExperimentsState {
  experiments: IterateExperiment[];
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

export async function loadExperiments(): Promise<ExperimentsState> {
  try {
    const raw = await fs.readFile(EXPERIMENTS_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    const experiments = Array.isArray(parsed?.experiments) ? parsed.experiments : [];
    return { experiments: experiments.filter(isExperiment) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { experiments: [] };
    throw err;
  }
}

async function saveExperiments(state: ExperimentsState): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const tmp = `${EXPERIMENTS_FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, EXPERIMENTS_FILE());
}

function isExperiment(value: unknown): value is IterateExperiment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<IterateExperiment>;
  return typeof candidate.id === 'string'
    && typeof candidate.hypothesis === 'string'
    && Array.isArray(candidate.variants)
    && typeof candidate.traffic === 'number'
    && typeof candidate.minSample === 'number'
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && (candidate.status === 'active' || candidate.status === 'ended' || candidate.status === 'paused');
}

export function createExperiment(
  hypothesis: string,
  opts: { variant?: string[]; traffic?: number; minSample?: number },
  now = new Date(),
): IterateExperiment {
  const variants = opts.variant && opts.variant.length > 0 ? opts.variant : ['current', 'candidate'];
  const timestamp = now.toISOString();
  return {
    id: randomBytes(4).toString('hex'),
    hypothesis,
    variants,
    traffic: opts.traffic ?? 50,
    minSample: opts.minSample ?? 1000,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'active',
  };
}

function findExperiment(state: ExperimentsState, id: string): IterateExperiment | undefined {
  return state.experiments.find((item) => item.id === id);
}

function formatOutcome(experiment: IterateExperiment): string {
  const details = [
    experiment.winner ? `winner=${experiment.winner}` : undefined,
    experiment.note ? `note="${experiment.note}"` : undefined,
  ].filter(Boolean);
  return details.length > 0 ? ` (${details.join(', ')})` : '';
}

function parseWinner(value?: string): IterateExperiment['winner'] | undefined {
  if (!value) return undefined;
  if (value === 'A' || value === 'B' || value === 'inconclusive') return value;
  return undefined;
}

function invalidTransitionMessage(experiment: IterateExperiment, status: IterateExperiment['status']): string | undefined {
  if (status === 'paused' && experiment.status !== 'active') {
    return `only active experiments can be paused: ${experiment.id} is ${experiment.status}`;
  }
  if (status === 'active' && experiment.status !== 'paused') {
    return `only paused experiments can be resumed: ${experiment.id} is ${experiment.status}`;
  }
  if (status === 'ended' && experiment.status !== 'active') {
    return `only active experiments can be ended: ${experiment.id} is ${experiment.status}`;
  }
  return undefined;
}

export function updateExperiment(
  state: ExperimentsState,
  id: string,
  status: IterateExperiment['status'],
  opts: { winner?: IterateExperiment['winner']; note?: string; now?: Date } = {},
): IterateExperiment | undefined {
  const experiment = findExperiment(state, id);
  if (!experiment) return undefined;
  if (invalidTransitionMessage(experiment, status)) return undefined;
  experiment.status = status;
  experiment.updatedAt = (opts.now ?? new Date()).toISOString();
  if (status === 'ended') {
    if (opts.winner) experiment.winner = opts.winner;
    if (opts.note) experiment.note = opts.note;
  } else {
    delete experiment.winner;
    delete experiment.note;
  }
  return experiment;
}

function printExperiments(state: ExperimentsState): void {
  if (state.experiments.length === 0) {
    console.log(kleur.dim('no experiments registered'));
    return;
  }
  for (const experiment of state.experiments) {
    const variants = experiment.variants.map((variant) => `"${variant}"`).join(' vs ');
    console.log(`${kleur.cyan(experiment.id)} ${experiment.status} ${experiment.traffic}% ${experiment.minSample} samples${formatOutcome(experiment)}`);
    console.log(`  hypothesis: ${experiment.hypothesis}`);
    console.log(`  variants: ${variants}`);
  }
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
    const state = await loadExperiments();
    const experiment = createExperiment(hypothesis, opts);
    state.experiments.push(experiment);
    await saveExperiments(state);
    console.log(kleur.green(`registered experiment: ${experiment.id}`));
    console.log(`  hypothesis: ${experiment.hypothesis}`);
    console.log(`  variants: ${experiment.variants.join(' vs ')}`);
    console.log(`  traffic: ${experiment.traffic}%`);
    console.log(`  min sample: ${experiment.minSample}`);
  });

iterateCmd
  .command('experiments')
  .description('Active and recently-ended experiments with significance')
  .option('--json')
  .option('--end <id>', 'mark an active experiment as ended')
  .option('--pause <id>', 'mark an active experiment as paused')
  .option('--resume <id>', 'mark a paused experiment as active')
  .option('--winner <result>', 'record an ending outcome: A, B, or inconclusive')
  .option('--note <text>', 'record an outcome note when ending an experiment')
  .action(async (opts: { json?: boolean; end?: string; pause?: string; resume?: string; winner?: string; note?: string }) => {
    const state = await loadExperiments();
    const mutationCount = [opts.end, opts.pause, opts.resume].filter(Boolean).length;

    if (mutationCount > 1) {
      console.error(kleur.red('choose only one of --end, --pause, or --resume'));
      process.exitCode = 1;
      return;
    }

    if ((opts.winner || opts.note) && !opts.end) {
      console.error(kleur.red('--winner and --note can only be used with --end'));
      process.exitCode = 1;
      return;
    }

    if (opts.end) {
      const winner = parseWinner(opts.winner);
      if (opts.winner && !winner) {
        console.error(kleur.red('invalid winner: expected A, B, or inconclusive'));
        process.exitCode = 1;
        return;
      }
      const experiment = findExperiment(state, opts.end);
      if (!experiment) {
        console.error(kleur.red(`experiment not found: ${opts.end}`));
        process.exitCode = 1;
        return;
      }
      const transitionError = invalidTransitionMessage(experiment, 'ended');
      if (transitionError) {
        console.error(kleur.red(transitionError));
        process.exitCode = 1;
        return;
      }
      updateExperiment(state, opts.end, 'ended', { winner, note: opts.note });
      await saveExperiments(state);
      console.log(kleur.yellow(`ended experiment: ${experiment.id}`));
      return;
    }

    if (opts.pause) {
      const experiment = findExperiment(state, opts.pause);
      if (!experiment) {
        console.error(kleur.red(`experiment not found: ${opts.pause}`));
        process.exitCode = 1;
        return;
      }
      const transitionError = invalidTransitionMessage(experiment, 'paused');
      if (transitionError) {
        console.error(kleur.red(transitionError));
        process.exitCode = 1;
        return;
      }
      updateExperiment(state, opts.pause, 'paused');
      await saveExperiments(state);
      console.log(kleur.yellow(`paused experiment: ${experiment.id}`));
      return;
    }

    if (opts.resume) {
      const experiment = findExperiment(state, opts.resume);
      if (!experiment) {
        console.error(kleur.red(`experiment not found: ${opts.resume}`));
        process.exitCode = 1;
        return;
      }
      const transitionError = invalidTransitionMessage(experiment, 'active');
      if (transitionError) {
        console.error(kleur.red(transitionError));
        process.exitCode = 1;
        return;
      }
      updateExperiment(state, opts.resume, 'active');
      await saveExperiments(state);
      console.log(kleur.green(`resumed experiment: ${experiment.id}`));
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify({
        active: state.experiments.filter((experiment) => experiment.status === 'active'),
        paused: state.experiments.filter((experiment) => experiment.status === 'paused'),
        ended: state.experiments.filter((experiment) => experiment.status === 'ended'),
      }, null, 2));
      return;
    }
    printExperiments(state);
  });
