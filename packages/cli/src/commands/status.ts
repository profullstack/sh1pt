import kleur from 'kleur';

interface Opts {
  target?: string;
}

export async function status(opts: Opts): Promise<void> {
  console.log(kleur.dim(`[stub] status · target=${opts.target ?? 'all'}`));
  // TODO: fetch from cloud API: latest release + live status per target
}
