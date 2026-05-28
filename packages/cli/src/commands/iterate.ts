import { Command } from 'commander';
import kleur from 'kleur';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { configDir } from '@profullstack/sh1pt-core';
import { describeInput, resolveInput } from '../input.js';

// agentsCmd moved to root level — see https://github.com/profullstack/sh1pt/issues/235

const GOALS_FILE    = () => path.join(configDir(), 'iterate-goals.json');
const RUNS_FILE     = () => path.join(configDir(), 'iterate-runs.json');
const WATCH_FILE    = () => path.join(configDir(), 'iterate-watch.json');
const METRICS_FILE  = () => path.join(configDir(), 'iterate-metrics.json');

interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt?: string;
  agent: string;
  scope: string;
  goals: Record<string, string>;
  status: 'pending' | 'applied' | 'skipped' | 'error';
  diff?: string;
  error?: string;
}

interface WatchConfig {
  agent: string;
  interval: number;
  quietHours?: string;
  cloud: boolean;
  enabledAt: string;
  lastRunAt?: string;
}

interface MetricSnapshot {
  capturedAt: string;
  values: Record<string, number | string>;
}

async function atomicWrite(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, file);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

async function loadGoals(): Promise<Record<string, string>> {
  return readJson(GOALS_FILE(), {});
}

async function saveGoals(goals: Record<string, string>): Promise<void> {
  await atomicWrite(GOALS_FILE(), goals);
}

async function loadRuns(): Promise<RunRecord[]> {
  return readJson(RUNS_FILE(), []);
}

async function appendRun(run: RunRecord): Promise<void> {
  const runs = await loadRuns();
  runs.push(run);
  if (runs.length > 100) runs.splice(0, runs.length - 100);
  await atomicWrite(RUNS_FILE(), runs);
}

async function loadMetrics(): Promise<MetricSnapshot | null> {
  return readJson<MetricSnapshot | null>(METRICS_FILE(), null);
}

async function saveMetrics(snap: MetricSnapshot): Promise<void> {
  await atomicWrite(METRICS_FILE(), snap);
}

async function loadWatchConfig(): Promise<WatchConfig | null> {
  return readJson<WatchConfig | null>(WATCH_FILE(), null);
}

async function saveWatchConfig(cfg: WatchConfig): Promise<void> {
  await atomicWrite(WATCH_FILE(), cfg);
}

async function clearWatchConfig(): Promise<void> {
  try { await fs.unlink(WATCH_FILE()); } catch { /* already gone */ }
}

const SCOPE_SIGNALS: Record<string, string[]> = {
  copy:       ['signup_conversion', 'cta_click_rate', 'bounce_rate'],
  pricing:    ['trial_to_paid', 'churn_rate', 'arpu'],
  onboarding: ['activation_rate', 'time_to_value', 'day7_retention'],
  perf:       ['p99_latency_ms', 'lighthouse_score', 'error_rate'],
  bugs:       ['error_rate', 'crash_rate', 'support_tickets'],
  all:        ['installs', 'signup_conversion', 'activation_rate', 'churn_rate', 'error_rate'],
};

function parseQuietHours(spec: string): { start: number; end: number } | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(spec);
  if (!m) return null;
  return { start: Number(m[1]), end: Number(m[2]) };
}

function inQuietHours(spec: string): boolean {
  const hours = parseQuietHours(spec);
  if (!hours) return false;
  const h = new Date().getHours();
  if (hours.start <= hours.end) return h >= hours.start && h < hours.end;
  return h >= hours.start || h < hours.end;
}

export const iterateCmd = new Command('iterate')
  .description('Observe metrics, have an agent propose changes, ship, measure. Powered by Claude / Codex / Qwen.')
  .option('--from <input>', 'existing live url, repo, or local path to start observing + iterating on')
  .action((opts: { from?: string }) => {
    if (opts.from) {
      const input = resolveInput(opts.from);
      const kind = input.kind;
      console.log(kleur.bold(`\nattaching iterate to ${kleur.cyan(describeInput(input))}\n`));
      if (kind === 'url') {
        console.log(kleur.dim('  → will baseline: uptime, latency (p50/p99), Lighthouse score'));
        console.log(kleur.dim('  → observation loop fires on metric drift > 10 %'));
        console.log(kleur.dim('  → run `sh1pt iterate watch` to start the daemon'));
      } else if (kind === 'git') {
        console.log(kleur.dim('  → will monitor: CI pass-rate, commit velocity, open-issue delta'));
        console.log(kleur.dim('  → run `sh1pt iterate watch` after configuring goals'));
      } else {
        console.log(kleur.dim('  → will read local metric sources declared in manifest'));
        console.log(kleur.dim('  → run `sh1pt iterate watch` after configuring goals'));
      }
      console.log();
      console.log(`  ${kleur.dim('next:')} ${kleur.white('sh1pt iterate goals conversion=8% churn=5%')}`);
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
  .option('--dry-run', 'show plan and proposed prompt without executing the agent')
  .option('--json', 'emit machine-readable run record on stdout')
  .action(async (opts: {
    agent: string;
    scope: string;
    autoApply?: boolean;
    maxFiles: number;
    dryRun?: boolean;
    json?: boolean;
  }) => {
    const goals = await loadGoals();
    const signals = SCOPE_SIGNALS[opts.scope] ?? SCOPE_SIGNALS.all;
    const lastMetrics = await loadMetrics();

    if (!opts.json) {
      console.log(kleur.bold(`\niterate run`));
      console.log(`  agent:    ${kleur.cyan(opts.agent)}`);
      console.log(`  scope:    ${kleur.cyan(opts.scope)}`);
      console.log(`  max-files:${kleur.cyan(String(opts.maxFiles))}`);

      if (Object.keys(goals).length) {
        console.log(kleur.bold('\ngoals:'));
        for (const [k, v] of Object.entries(goals))
          console.log(`  ${kleur.cyan(k)} → ${v}`);
      } else {
        console.log(kleur.yellow('\nno goals set — run `sh1pt iterate goals conversion=8%` to declare targets'));
      }

      console.log(kleur.bold('\nmetric signals to observe:'));
      for (const s of signals) console.log(`  ${kleur.dim('·')} ${s}`);

      if (lastMetrics) {
        console.log(kleur.dim(`\nlast snapshot: ${lastMetrics.capturedAt}`));
        for (const [k, v] of Object.entries(lastMetrics.values))
          if (signals.includes(k)) console.log(`  ${kleur.cyan(k)}: ${v}`);
      } else {
        console.log(kleur.dim('\nno prior metric snapshot — first run will establish baseline'));
      }
    }

    const record: RunRecord = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      agent: opts.agent,
      scope: opts.scope,
      goals,
      status: 'pending',
    };

    if (opts.dryRun) {
      record.status = 'skipped';
      record.finishedAt = new Date().toISOString();
      if (opts.json) {
        console.log(JSON.stringify({ run: record, dryRun: true }, null, 2));
        return;
      }
      console.log(kleur.yellow('\ndry-run — no agent invoked, no changes applied'));
      console.log(kleur.dim(`run id: ${record.id}`));
      await appendRun(record);
      return;
    }

    // Capture metric baseline for this run
    const snap: MetricSnapshot = {
      capturedAt: new Date().toISOString(),
      values: Object.fromEntries(signals.map(s => [s, lastMetrics?.values[s] ?? 'no-data'])),
    };
    await saveMetrics(snap);

    const agentBin = opts.agent === 'claude' ? 'claude' : opts.agent === 'codex' ? 'codex' : opts.agent;
    const prompt = [
      'You are sh1pt iterate — a focused product-improvement agent.',
      Object.keys(goals).length
        ? `Goals: ${Object.entries(goals).map(([k, v]) => `${k}=${v}`).join(', ')}.`
        : 'No explicit goals set.',
      `Scope: ${opts.scope}.`,
      `Signals: ${signals.join(', ')}.`,
      lastMetrics
        ? `Current values: ${signals.map(s => `${s}=${snap.values[s] ?? 'no-data'}`).join(', ')}.`
        : 'No prior baseline. Establish baseline changes only.',
      `Constraints: touch at most ${opts.maxFiles} files. Prefer small, reversible changes.`,
      `Propose 1-3 concrete, targeted changes. For each change: explain WHY (which goal it moves), WHAT file/line, and the exact diff.`,
    ].join(' ');

    if (!opts.json) {
      console.log(kleur.bold('\nagent prompt:'));
      console.log(kleur.dim(prompt.slice(0, 300) + (prompt.length > 300 ? '…' : '')));
    }

    if (!opts.autoApply && !opts.json) {
      const readline = await import('node:readline/promises');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ans = await rl.question(kleur.yellow('\napply agent changes? [y/N] '));
      rl.close();
      if (ans.trim().toLowerCase() !== 'y') {
        record.status = 'skipped';
        record.finishedAt = new Date().toISOString();
        await appendRun(record);
        console.log(kleur.dim('skipped'));
        return;
      }
    }

    // Invoke agent
    const result = spawnSync(agentBin, ['--print', prompt], {
      encoding: 'utf8',
      stdio: opts.json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    if (result.error || result.status !== 0) {
      record.status = 'error';
      record.error = result.error?.message ?? `exit ${result.status}`;
      record.finishedAt = new Date().toISOString();
      await appendRun(record);
      if (opts.json) { console.log(JSON.stringify({ run: record }, null, 2)); return; }
      console.error(kleur.red(`\nagent failed: ${record.error}`));
      console.log(kleur.dim(`hint: install ${agentBin} or try --dry-run to preview the prompt`));
      return;
    }

    record.status = 'applied';
    record.diff = result.stdout ?? '';
    record.finishedAt = new Date().toISOString();
    await appendRun(record);

    if (opts.json) { console.log(JSON.stringify({ run: record }, null, 2)); return; }
    console.log(kleur.green('\nagent cycle complete'));
    console.log(kleur.dim(`run id: ${record.id}`));
    console.log(kleur.dim('next: sh1pt build && sh1pt promote ship --channel beta'));
  });

iterateCmd
  .command('watch')
  .description('Daemon mode — run a cycle on every significant metric change')
  .option('--agent <id>', 'claude | codex | qwen', 'claude')
  .option('--cloud', 'schedule and run the watch loop in sh1pt cloud')
  .option('--interval <seconds>', 're-check interval', Number, 3600)
  .option('--quiet-hours <start-end>', 'e.g. 22-08 (24h local) to pause overnight')
  .option('--stop', 'disable the current watch configuration')
  .option('--status', 'show current watch configuration')
  .action(async (opts: {
    agent: string;
    cloud?: boolean;
    interval: number;
    quietHours?: string;
    stop?: boolean;
    status?: boolean;
  }) => {
    if (opts.stop) {
      await clearWatchConfig();
      console.log(kleur.yellow('iterate watch disabled'));
      return;
    }

    if (opts.status) {
      const cfg = await loadWatchConfig();
      if (!cfg) {
        console.log(kleur.dim('iterate watch is not configured — run `sh1pt iterate watch` to start'));
        return;
      }
      console.log(kleur.bold('\niterate watch config:'));
      console.log(`  agent:       ${kleur.cyan(cfg.agent)}`);
      console.log(`  interval:    ${kleur.cyan(String(cfg.interval))}s`);
      if (cfg.quietHours) console.log(`  quiet-hours: ${kleur.cyan(cfg.quietHours)}`);
      console.log(`  cloud:       ${cfg.cloud ? kleur.green('yes') : kleur.dim('no (local)')}`);
      console.log(`  enabled:     ${kleur.dim(cfg.enabledAt)}`);
      if (cfg.lastRunAt) console.log(`  last run:    ${kleur.dim(cfg.lastRunAt)}`);
      if (cfg.quietHours && inQuietHours(cfg.quietHours))
        console.log(kleur.yellow('  ⏸ currently in quiet hours'));
      return;
    }

    const cfg: WatchConfig = {
      agent: opts.agent,
      interval: opts.interval,
      quietHours: opts.quietHours,
      cloud: !!opts.cloud,
      enabledAt: new Date().toISOString(),
    };
    await saveWatchConfig(cfg);

    console.log(kleur.bold('\niterate watch configured'));
    console.log(`  agent:    ${kleur.cyan(cfg.agent)}`);
    console.log(`  interval: ${kleur.cyan(String(cfg.interval))}s (${Math.round(cfg.interval / 60)} min)`);
    if (cfg.quietHours) console.log(`  quiet:    ${kleur.cyan(cfg.quietHours)}`);

    if (opts.cloud) {
      console.log(kleur.bold('\ncloud mode:'));
      console.log(kleur.dim('  the watch loop runs in sh1pt cloud infrastructure'));
      console.log(kleur.dim('  it will fire `sh1pt iterate run` on a scheduled interval'));
      console.log(kleur.dim('  cloud credentials must be configured via `sh1pt scale up`'));
      console.log(`\n  ${kleur.dim('deploy with:')} sh1pt scale deploy --cloud`);
    } else {
      console.log(kleur.bold('\nlocal mode:'));
      console.log(kleur.dim('  add the following line to your crontab (`crontab -e`):'));
      const intervalMin = Math.max(1, Math.round(cfg.interval / 60));
      const cron = cfg.quietHours
        ? `# quiet ${cfg.quietHours}: adjust hours to taste`
        : '';
      if (cron) console.log(kleur.dim(`  # ${cron}`));
      console.log(kleur.white(`  */${intervalMin} * * * * sh1pt iterate run --agent ${cfg.agent} --auto-apply`));
      console.log();
      console.log(kleur.dim('  or run a one-shot cycle now with:'));
      console.log(kleur.white(`  sh1pt iterate run --agent ${cfg.agent}`));
    }
    console.log();
    console.log(kleur.dim('use `sh1pt iterate watch --stop` to disable'));
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
