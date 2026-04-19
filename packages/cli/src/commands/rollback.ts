import kleur from 'kleur';

interface Opts {
  target?: string[];
}

export async function rollback(opts: Opts): Promise<void> {
  const targets = opts.target?.join(', ') ?? 'all enabled';
  console.log(kleur.yellow(`[stub] rollback · targets=${targets}`));
  // TODO: resolve previous release, invoke Target.rollback()
}
