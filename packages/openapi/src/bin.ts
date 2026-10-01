#!/usr/bin/env node
// Standalone entry so CI can run the contract check with
// `npx -y @profullstack/sh1pt-openapi diff <base> <head>` without installing
// the whole sh1pt CLI. Same flags and exit codes as `sh1pt openapi diff`.
import { loadSpecRef, normalize } from './core/index.js';
import { diffApis, formatDiff } from './diff/index.js';

const USAGE = `usage: sh1pt-openapi diff <base> <head> [--fail-on breaking|warning|never] [--all] [--json]

<base> and <head> are a path, a URL, or <git-ref>:<path> (e.g. origin/main:openapi.json).
Exits 1 when head would break a client built against base.`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd !== 'diff') {
    console.error(USAGE);
    return cmd === '--help' || cmd === '-h' ? 0 : 2;
  }
  const positional: string[] = [];
  let failOn = 'breaking';
  let all = false;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--all') all = true;
    else if (a === '--json') json = true;
    else if (a === '--fail-on') failOn = rest[++i] ?? '';
    else if (a.startsWith('--fail-on=')) failOn = a.slice('--fail-on='.length);
    else if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
    else positional.push(a);
  }
  if (positional.length !== 2 || !['breaking', 'warning', 'never'].includes(failOn)) {
    console.error(USAGE);
    return 2;
  }
  const diff = diffApis(normalize(await loadSpecRef(positional[0]!)), normalize(await loadSpecRef(positional[1]!)));
  console.log(json ? JSON.stringify(diff, null, 2) : formatDiff(diff, { includeInfo: all }));
  if (failOn === 'breaking') return diff.breaking > 0 ? 1 : 0;
  if (failOn === 'warning') return diff.breaking + diff.warnings > 0 ? 1 : 0;
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
  },
);
