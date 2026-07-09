import { Command } from 'commander';
import kleur from 'kleur';

export const runsCmd = new Command('run')
  .description('Inspect sh1pt cloud runs, logs, artifacts, and status.');

runsCmd
  .command('list')
  .description('List recent cloud runs for the current project.')
  .option('--project <id>', 'filter to one cloud project')
  .option('--status <status>', 'queued | running | succeeded | failed | canceled')
  .option('--json', 'emit machine-readable JSON')
  .action((opts: { project?: string; status?: string; json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ runs: [] }, null, 2));
      return;
    }
    const filters = [
      opts.project ? `project=${opts.project}` : undefined,
      opts.status ? `status=${opts.status}` : undefined,
    ].filter(Boolean).join(' ');
    console.log(kleur.dim(`[stub] run list${filters ? ` · ${filters}` : ''}`));
    // TODO: GET /v1/runs and render latest build/ship/iterate runs.
  });

runsCmd
  .command('status <runId>')
  .description('Show one cloud run status, timing, targets, and artifact summary.')
  .option('--json', 'emit machine-readable JSON')
  .action((runId: string, opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ id: runId, status: 'unknown' }, null, 2));
      return;
    }
    console.log(kleur.dim(`[stub] run status · id=${runId}`));
    // TODO: GET /v1/runs/:id.
  });

runsCmd
  .command('logs <runId>')
  .description('Print or follow logs for one cloud run.')
  .option('-f, --follow', 'stream logs until the run finishes')
  .option('--target <id>', 'filter logs to one target')
  .action((runId: string, opts: { follow?: boolean; target?: string }) => {
    const target = opts.target ? ` · target=${opts.target}` : '';
    console.log(kleur.dim(`[stub] run logs · id=${runId} · follow=${!!opts.follow}${target}`));
    // TODO: stream NDJSON-over-SSE from /v1/runs/:id/logs.
  });

runsCmd
  .command('artifacts <runId>')
  .description('List artifacts produced by one cloud run.')
  .option('--json', 'emit machine-readable JSON')
  .action((runId: string, opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ id: runId, artifacts: [] }, null, 2));
      return;
    }
    console.log(kleur.dim(`[stub] run artifacts · id=${runId}`));
    // TODO: GET /v1/runs/:id/artifacts.
  });
