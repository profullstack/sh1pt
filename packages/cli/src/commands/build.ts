import kleur from 'kleur';

interface Opts {
  target?: string[];
  channel: string;
  cloud?: boolean;
}

export async function build(opts: Opts): Promise<void> {
  const targets = opts.target?.join(', ') ?? 'all enabled';
  const where = opts.cloud ? 'cloud' : 'local';
  console.log(kleur.cyan(`[stub] build (${where}) · channel=${opts.channel} · targets=${targets}`));
  // TODO: load manifest, resolve targets, invoke Target.build(), stream logs
}
