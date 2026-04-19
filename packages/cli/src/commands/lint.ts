import kleur from 'kleur';
import { lint } from '@sh1pt/policy';
import type { Manifest } from '@sh1pt/core';

interface Opts {
  strict?: boolean;
  json?: boolean;
}

// Loaded from sh1pt.config.ts at runtime — stubbed here.
async function loadManifest(): Promise<Manifest> {
  return {
    name: 'stub',
    version: '0.0.0',
    channels: ['stable', 'beta', 'canary'],
    targets: {},
  };
}

export async function lintCmd(opts: Opts): Promise<void> {
  const manifest = await loadManifest();
  const result = await lint({ manifest, projectDir: process.cwd() });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const f of result.findings) {
      const color = f.severity === 'error' ? kleur.red : f.severity === 'warn' ? kleur.yellow : kleur.dim;
      const tag = color(`[${f.severity}]`);
      const loc = f.path ? kleur.dim(` ${f.path}`) : '';
      console.log(`${tag} ${kleur.dim(f.ruleId)}${loc} — ${f.message}`);
      if (f.fix) console.log(`       ${kleur.dim('fix:')} ${f.fix}`);
    }
    console.log(
      `\n${result.errors} error${result.errors === 1 ? '' : 's'}, ${result.warnings} warning${result.warnings === 1 ? '' : 's'}`,
    );
  }

  const failed = result.errors > 0 || (opts.strict && result.warnings > 0);
  if (failed) process.exit(1);
}
