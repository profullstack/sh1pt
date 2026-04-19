import kleur from 'kleur';

interface Opts {
  target?: string;
  follow?: boolean;
}

export async function logsCmd(opts: Opts): Promise<void> {
  console.log(kleur.dim(`[stub] logs · target=${opts.target ?? 'all'} · follow=${!!opts.follow}`));
  // TODO: stream from cloud log store (NDJSON over SSE)
}
