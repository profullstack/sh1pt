import kleur from 'kleur';

interface Opts {
  target?: string[];
  channel: string;
  dryRun?: boolean;
  skipLint?: boolean;
}

export async function ship(opts: Opts): Promise<void> {
  const targets = opts.target?.join(', ') ?? 'all enabled';
  const tag = opts.dryRun ? kleur.yellow('[dry-run]') : kleur.green('[live]');
  if (!opts.skipLint) {
    console.log(kleur.dim('[stub] running `sh1pt lint` — blocks ship on policy errors'));
  }
  console.log(`${tag} ship · channel=${opts.channel} · targets=${targets}`);
  // TODO: load manifest, resolve latest build, invoke Target.ship(), record release
}
