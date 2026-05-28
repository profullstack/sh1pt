import { Command } from 'commander';
import kleur from 'kleur';
import type { JurisdictionDescribe } from '@profullstack/sh1pt-core';

const KNOWN_PACKS = [
  'au', 'bb', 'bw', 'ca', 'dao-wy', 'fj', 'gh', 'hk',
  'ie', 'in', 'jm', 'ke', 'my', 'ng', 'nz', 'pk',
  'sg', 'tt', 'tz', 'ug', 'uk', 'us', 'za', 'zm', 'zw',
] as const;

// `sh1pt entity` â auxiliary command for entity-ops (formation + name
// checks + doc generation + filing handoff + compliance tracking).
// Cross-cuts the 4 primary verbs so it lives top-level alongside
// login/secret/config. Packs live under packages/entity/* and implement
// the JurisdictionPack interface in @profullstack/sh1pt-core.
export const entityCmd = new Command('entity')
  .description('Entity operations â formation, compliance, spinouts (uses jurisdiction packs)')
  .action(() => { entityCmd.help(); });

// ---- pack ------------------------------------------------------------
const packCmd = entityCmd
  .command('pack')
  .description('Jurisdiction pack registry â list, inspect support level')
  .action(() => { packCmd.help(); });

packCmd
  .command('list')
  .description('List all installed jurisdiction packs with support levels')
  .option('--json')
  .action(async (opts: { json?: boolean }) => {
    const results: JurisdictionDescribe[] = [];
    for (const code of KNOWN_PACKS) {
      try {
        const m = await import(`@profullstack/sh1pt-entity-${code}`);
        results.push((m.default as any).describe());
      } catch { /* pack not installed */ }
    }
    if (opts.json) { console.log(JSON.stringify({ packs: results }, null, 2)); return; }
    if (!results.length) { console.log(kleur.dim('no entity packs installed')); return; }
    const C1 = 12, C2 = 14;
    console.log(kleur.bold('CODE'.padEnd(C1) + 'SUPPORT'.padEnd(C2) + 'ENTITY TYPES'));
    console.log('â'.repeat(70));
    for (const d of results) {
      const lc = d.supportLevel === 'full' ? kleur.green : d.supportLevel === 'assisted' ? kleur.yellow : kleur.dim;
      console.log(kleur.cyan(d.jurisdictionCode.padEnd(C1)) + lc(d.supportLevel.padEnd(C2)) + kleur.dim((d.entityTypesSupported ?? []).join(', ')));
    }
    console.log(kleur.dim(`\n${results.length} pack(s) installed`));
  });

packCmd
  .command('info <pack>')
  .description('Show support level, entity types, filing modes for a pack (e.g. us, nz, uk)')
  .action(async (pack: string) => {
    const code = pack.replace(/^entity-/, '').replace(/^@profullstack\/sh1pt-entity-/, '');
    try {
      const m = await import(`@profullstack/sh1pt-entity-${code}`);
      const d: JurisdictionDescribe = (m.default as any).describe();
      console.log(kleur.bold(`\n${d.displayName} (${d.jurisdictionCode})`));
      console.log(`  pack id:  ${kleur.cyan(d.packId)}`);
      const lc = d.supportLevel === 'full' ? kleur.green : kleur.yellow;
      console.log(`  support:  ${lc(d.supportLevel)}`);
      console.log(`  version:  ${d.version}`);
      console.log(`  types:    ${(d.entityTypesSupported ?? []).join(', ')}`);
      console.log(`  filing:   ${(d.filingModesSupported ?? []).join(', ')}`);
      if (d.requiredInputs?.length) console.log(`  inputs:   ${d.requiredInputs.join(', ')}`);
      if (d.requiredManualSteps?.length) console.log(`  manual:   ${d.requiredManualSteps.join(', ')}`);
      if (d.experimental) console.log(kleur.magenta('  â  experimental'));
    } catch {
      console.error(kleur.red(`pack not found: ${code}`)); process.exit(1);
    }
  });
