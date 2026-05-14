import { Command } from 'commander';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import {
  formatIterateGoals,
  iterateGoalsPath,
  parseGoalAssignments,
  readIterateGoals,
  writeIterateGoals,
} from '../iterate-goals.js';
import { agentsCmd } from './agents.js';

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
  .option('--json', 'print goals as JSON')
  .option('--clear', 'remove all saved iterate goals')
  .action(async (kv: string[], opts: { json?: boolean; clear?: boolean }) => {
    try {
      if (opts.clear) {
        await writeIterateGoals({});
        if (opts.json) {
          console.log(JSON.stringify({ goals: {} }, null, 2));
          return;
        }
        console.log(kleur.yellow(`cleared iterate goals → ${iterateGoalsPath()}`));
        return;
      }

      const existing = await readIterateGoals();
      const updates = parseGoalAssignments(kv);
      const goals = Object.keys(updates).length > 0 ? { ...existing, ...updates } : existing;

      if (Object.keys(updates).length > 0) {
        await writeIterateGoals(goals);
      }

      if (opts.json) {
        console.log(JSON.stringify({ goals }, null, 2));
        return;
      }

      const formatted = formatIterateGoals(goals);
      if (formatted.length === 0) {
        console.log(kleur.dim('no iterate goals set'));
        return;
      }

      if (Object.keys(updates).length > 0) {
        console.log(kleur.green(`saved ${formatted.length} iterate goal${formatted.length === 1 ? '' : 's'} → ${iterateGoalsPath()}`));
      }
      for (const line of formatted) console.log(line);
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
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
