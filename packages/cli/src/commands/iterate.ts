import { Command } from 'commander';
import kleur from 'kleur';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { configDir } from '@profullstack/sh1pt-core';
import { describeInput, resolveInput } from '../input.js';

// agentsCmd moved to root level — see https://github.com/profullstack/sh1pt/issues/235

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/** Atomic write: write to .tmp then rename — same pattern as goals. */
async function atomicWrite(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, file);
}

/** Generic JSON loader with ENOENT handling. */
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Goals persistence (unchanged)
// ---------------------------------------------------------------------------

const GOALS_FILE = () => path.join(configDir(), 'iterate-goals.json');
const EXPERIMENTS_FILE = () => path.join(configDir(), 'iterate-experiments.json');
const RUNS_FILE = () => path.join(configDir(), 'iterate-runs.json');
const METRICS_FILE = () => path.join(configDir(), 'iterate-metrics.json');
const WATCH_FILE = () => path.join(configDir(), 'iterate-watch.json');

async function loadGoals(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>(GOALS_FILE(), {});
}

async function saveGoals(goals: Record<string, string>): Promise<void> {
  await atomicWrite(GOALS_FILE(), goals);
}

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
  return readJson<ExperimentState>(EXPERIMENTS_FILE(), { experiments: [] });
}

async function saveExperiments(state: ExperimentState): Promise<void> {
  await atomicWrite(EXPERIMENTS_FILE(), state);
}

// ---------------------------------------------------------------------------
// Run record types & persistence
// ---------------------------------------------------------------------------

export type RunStatus = 'completed' | 'skipped' | 'failed';

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  agent: string;
  scope: string;
  goals: Record<string, string>;
  status: RunStatus;
  diff?: string;
  agentOutput?: string;
}

const MAX_RUNS = 100;

async function loadRuns(): Promise<RunRecord[]> {
  return readJson<RunRecord[]>(RUNS_FILE(), []);
}

async function saveRun(record: RunRecord): Promise<void> {
  const runs = await loadRuns();
  runs.push(record);
  // Cap at MAX_RUNS
  const trimmed = runs.slice(-MAX_RUNS);
  await atomicWrite(RUNS_FILE(), trimmed);
}

// ---------------------------------------------------------------------------
// Metric snapshot types
// ---------------------------------------------------------------------------

export interface MetricSnapshot {
  capturedAt: string;
  scope: string;
  signals: Record<string, string | number | null>;
}

const SCOPE_SIGNALS: Record<string, string[]> = {
  copy:       ['headline_ctr', 'signup_rate', 'bounce_rate'],
  pricing:    ['conversion_rate', 'arpu', 'trial_to_paid'],
  onboarding: ['activation_rate', 'time_to_first_value', 'step_drop_off'],
  perf:       ['p50_latency_ms', 'p95_latency_ms', 'error_rate'],
  bugs:       ['error_rate', 'crash_rate', 'open_issues'],
  all:        ['installs', 'signup_rate', 'conversion_rate', 'churn_rate', 'error_rate', 'p50_latency_ms'],
};

function captureMetricSnapshot(scope: string): MetricSnapshot {
  const signals = SCOPE_SIGNALS[scope] ?? SCOPE_SIGNALS['all']!;
  const snapshot: MetricSnapshot = {
    capturedAt: new Date().toISOString(),
    scope,
    signals: Object.fromEntries(signals.map((s) => [s, null])),
  };
  return snapshot;
}

// ---------------------------------------------------------------------------
// Watch config types
// ---------------------------------------------------------------------------

export interface WatchConfig {
  agent: string;
  scope: string;
  interval: number;
  quietHours?: string;
  cloud: boolean;
  createdAt: string;
}

function inQuietHours(spec: string): boolean {
  const match = spec.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) return false;
  const start = parseInt(match[1]!, 10);
  const end   = parseInt(match[2]!, 10);
  const hour  = new Date().getHours();
  if (start <= end) return hour >= start && hour < end;
  // overnight: e.g. 22-08 wraps midnight
  return hour >= start || hour < end;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export const iterateCmd = new Command('iterate')
  .description('Observe metrics, have an agent propose changes, ship, measure. Powered by Claude / Codex / Qwen.')
  .option('--from <input>', 'existing live url, repo, or local path to start observing + iterating on')
  .action((opts: { from?: string }) => {
    if (opts.from) {
      const input = resolveInput(opts.from);
      console.log(kleur.cyan(`[stub] iterate attach · from=${describeInput(input)}`));
      return;
    }
    iterateCmd.help();
  });

// ---------------------------------------------------------------------------
// iterate run
// ---------------------------------------------------------------------------

iterateCmd
  .command('run')
  .description('Single-shot cycle: pull metrics → have agent propose changes → apply (with confirmation) → ship')
  .option('--agent <id>', 'claude | codex | qwen', 'claude')
  .option('--scope <area>', 'copy | pricing | onboarding | perf | bugs | all', 'all')
  .option('--auto-apply', 'skip confirmation and apply agent changes directly')
  .option('--max-files <n>', 'hard cap on files the agent may touch', Number, 5)
  .option('--dry-run', 'skip agent invocation and record as skipped')
  .option('--json', 'machine-readable output')
  .action(async (opts: {
    agent: string;
    scope: string;
    autoApply?: boolean;
    maxFiles: number;
    dryRun?: boolean;
    json?: boolean;
  }) => {
    const id = randomBytes(4).toString('hex');
    const startedAt = new Date().toISOString();
    const goals = await loadGoals();

    // Capture metric snapshot
    const snapshot = captureMetricSnapshot(opts.scope);
    await atomicWrite(METRICS_FILE(), snapshot);

    if (opts.dryRun) {
      const record: RunRecord = {
        id, startedAt, finishedAt: new Date().toISOString(),
        agent: opts.agent, scope: opts.scope, goals, status: 'skipped',
      };
      await saveRun(record);

      if (opts.json) { console.log(JSON.stringify(record, null, 2)); return; }
      console.log(kleur.yellow(`[dry-run] iterate run ${id} — skipped agent invocation`));
      console.log(kleur.dim(`  scope: ${opts.scope} | agent: ${opts.agent}`));
      console.log(kleur.dim(`  goals: ${Object.keys(goals).length > 0 ? Object.entries(goals).map(([k,v]) => `${k}=${v}`).join(', ') : 'none set'}`));
      return;
    }

    // Build prompt
    const goalLines = Object.entries(goals).map(([k, v]) => `  - ${k}: ${v}`).join('\n') || '  (none set)';
    const signalNames = (SCOPE_SIGNALS[opts.scope] ?? SCOPE_SIGNALS['all']!).join(', ');
    const prompt = [
      `You are helping improve a software product. Scope: ${opts.scope}.`,
      `Goals:\n${goalLines}`,
      `Relevant metrics to check: ${signalNames}.`,
      `Propose 1-3 concrete, minimal code changes (max ${opts.maxFiles} files) that move the metrics toward the goals.`,
      `Output a unified diff or a clear description of each change.`,
    ].join('\n\n');

    // Look up agent binary
    const agentBins: Record<string, string[]> = {
      claude: ['claude', '--print'],
      codex:  ['codex', '--quiet'],
      qwen:   ['qwen-agent', '--run'],
    };
    const [agentBin, ...agentFlags] = agentBins[opts.agent] ?? ['claude', '--print'];

    console.log(kleur.cyan(`→ iterate run ${id}`));
    console.log(kleur.dim(`  agent: ${opts.agent} | scope: ${opts.scope}`));

    const result = spawnSync(agentBin!, [...agentFlags, prompt], {
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finishedAt = new Date().toISOString();
    const agentOutput = (result.stdout ?? '').trim();
    // Use exit code to determine status: treat non-zero exit as failed,
    // not just process spawn errors, so the user gets a meaningful signal.
    const status: RunStatus = (result.error || (result.status !== 0 && result.status !== null))
      ? 'failed'
      : 'completed';

    const record: RunRecord = {
      id, startedAt, finishedAt, agent: opts.agent,
      scope: opts.scope, goals, status, agentOutput,
    };
    await saveRun(record);

    if (opts.json) { console.log(JSON.stringify(record, null, 2)); return; }

    if (status === 'failed') {
      console.log(kleur.red(`agent invocation failed: ${result.error?.message ?? 'unknown error'}`));
      console.log(kleur.dim('Tip: run `sh1pt agents list` to verify your agent CLI is installed.'));
      return;
    }

    console.log(kleur.green('\nAgent proposal:'));
    console.log(agentOutput || kleur.dim('(no output)'));

    if (!opts.autoApply && agentOutput) {
      console.log(kleur.yellow('\nApply these changes? (use --auto-apply to skip this prompt)'));
      console.log(kleur.dim('Inspect the diff above, then run: sh1pt build && sh1pt ship --channel beta'));
    }
  });

// ---------------------------------------------------------------------------
// iterate watch
// ---------------------------------------------------------------------------

iterateCmd
  .command('watch')
  .description('Configure a daemon that runs iterate run on every significant metric change')
  .option('--agent <id>', 'claude | codex | qwen', 'claude')
  .option('--scope <area>', 'copy | pricing | onboarding | perf | bugs | all', 'all')
  .option('--cloud', 'schedule in sh1pt cloud instead of local cron')
  .option('--interval <seconds>', 're-check interval in seconds', Number, 3600)
  .option('--quiet-hours <start-end>', 'pause during these local hours, e.g. 22-08')
  .option('--stop', 'remove the watch configuration')
  .option('--status', 'show current watch configuration')
  .action(async (opts: {
    agent: string;
    scope: string;
    cloud?: boolean;
    interval: number;
    quietHours?: string;
    stop?: boolean;
    status?: boolean;
  }) => {
    if (opts.stop) {
      try { await fs.unlink(WATCH_FILE()); } catch { /* already gone */ }
      console.log(kleur.yellow('watch configuration removed'));
      return;
    }

    if (opts.status) {
      const config = await readJson<WatchConfig | null>(WATCH_FILE(), null);
      if (!config) {
        console.log(kleur.dim('no watch configured — run `sh1pt iterate watch` to set one up'));
        return;
      }
      console.log(kleur.bold('watch configuration:'));
      console.log(`  ${kleur.cyan('agent:'.padEnd(14))} ${config.agent}`);
      console.log(`  ${kleur.cyan('interval:'.padEnd(14))} ${config.interval}s`);
      if (config.quietHours) {
        const quiet = inQuietHours(config.quietHours);
        console.log(`  ${kleur.cyan('quiet-hours:'.padEnd(14))} ${config.quietHours} (currently: ${quiet ? kleur.yellow('quiet') : kleur.green('active')})`);
      }
      console.log(`  ${kleur.cyan('cloud:'.padEnd(14))} ${config.cloud ? 'yes' : 'no'}`);
      console.log(`  ${kleur.cyan('created:'.padEnd(14))} ${config.createdAt}`);
      return;
    }

    const config: WatchConfig = {
      agent: opts.agent,
      scope: opts.scope,
      interval: opts.interval,
      quietHours: opts.quietHours,
      cloud: opts.cloud ?? false,
      createdAt: new Date().toISOString(),
    };
    await atomicWrite(WATCH_FILE(), config);

    console.log(kleur.green('watch configured'));
    console.log(`  ${kleur.cyan('agent:'.padEnd(14))} ${config.agent}`);
    console.log(`  ${kleur.cyan('interval:'.padEnd(14))} every ${config.interval}s`);
    if (config.quietHours) {
      console.log(`  ${kleur.cyan('quiet-hours:'.padEnd(14))} ${config.quietHours}`);
    }

    if (config.cloud) {
      console.log(kleur.dim('\nCloud mode: run `sh1pt scale deploy --cloud` to start the remote watch loop.'));
    } else {
      const intervalMin = Math.round(config.interval / 60);
      const cronMin = intervalMin >= 1 ? `*/${intervalMin}` : '*';
      const cron = `${cronMin} * * * * sh1pt iterate run --agent ${config.agent} --scope ${config.scope} --auto-apply`;
      console.log(kleur.dim('\nLocal mode — add this to your crontab:'));
      console.log(kleur.cyan(`  ${cron}`));
      console.log(kleur.dim('  (run `crontab -e` to edit)'));
    }
  });

// ---------------------------------------------------------------------------
// iterate goals
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// iterate test
// ---------------------------------------------------------------------------

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
      id, hypothesis,
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

// ---------------------------------------------------------------------------
// iterate experiments
// ---------------------------------------------------------------------------

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

    const mutateId = opts.end ?? opts.pause ?? opts.resume;
    if (mutateId) {
      const exp = state.experiments.find(e => e.id === mutateId);
      if (!exp) {
        console.error(kleur.red(`experiment "${mutateId}" not found`));
        process.exit(1);
      }
      if (opts.end) {
        exp.status = 'ended';
        if (opts.winner) exp.winner = opts.winner as 'A' | 'B' | 'inconclusive';
        if (opts.note) exp.note = opts.note;
        exp.updatedAt = new Date().toISOString();
        console.log(kleur.yellow(`ended: ${exp.id}${opts.winner ? ` · winner=${opts.winner}` : ''}`));
      } else if (opts.pause) {
        exp.status = 'paused';
        exp.updatedAt = new Date().toISOString();
        console.log(kleur.yellow(`paused: ${exp.id}`));
      } else if (opts.resume) {
        exp.status = 'active';
        exp.updatedAt = new Date().toISOString();
        console.log(kleur.green(`resumed: ${exp.id}`));
      }
      await saveExperiments(state);
      return;
    }

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
        if (e.variants.length > 0) console.log(kleur.dim(`    variants: ${e.variants.join(', ')}`));
        if (e.winner) console.log(kleur.dim(`    winner: ${e.winner}`));
        if (e.note)   console.log(kleur.dim(`    note: ${e.note}`));
      }
    }

    printGroup('Active', active);
    printGroup('Paused', paused);
    printGroup('Ended',  ended);
    console.log(kleur.dim(`\n${active.length} active / ${state.experiments.length} total`));
  });
