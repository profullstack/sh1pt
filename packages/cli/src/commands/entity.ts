import { Command } from 'commander';
import kleur from 'kleur';

// `sh1pt entity` — auxiliary command for entity-ops (formation + name
// checks + doc generation + filing handoff + compliance tracking).
// Cross-cuts the 4 primary verbs so it lives top-level alongside
// login/secret/config. Packs live under packages/entity/* and implement
// the JurisdictionPack interface in @sh1pt/core.

export const entityCmd = new Command('entity')
  .description('Entity operations — formation, compliance, spinouts (uses jurisdiction packs)')
  .action(() => { entityCmd.help(); });

// ---- pack ------------------------------------------------------------

const packCmd = entityCmd
  .command('pack')
  .description('Jurisdiction pack registry — list, inspect support level')
  .action(() => { packCmd.help(); });

packCmd
  .command('list')
  .description('List all installed jurisdiction packs with support levels')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ packs: [] }, null, 2)); return; }
    console.log(kleur.dim('[stub] entity pack list — enumerate registered JurisdictionPacks'));
  });

packCmd
  .command('info <pack>')
  .description('Show support level, entity types, filing modes for a pack (e.g. us, nz, uk)')
  .action((pack: string) => {
    console.log(kleur.cyan(`[stub] entity pack info ${pack}`));
  });

// ---- init / compare --------------------------------------------------

entityCmd
  .command('init <slug>')
  .description('Initialise an entity workspace (./entities/<slug>/)')
  .option('--parent <name>', 'parent entity (studio / holdco)')
  .option('--jurisdiction <code>', 'jurisdiction pack code (us-delaware, nz, uk, hk, au, …)')
  .option('--type <type>', 'entity type (c-corp, llc, limited-company, private-company, …)')
  .option('--project <slug>', 'originating project slug (for spinouts)')
  .action((slug: string, opts: { parent?: string; jurisdiction?: string; type?: string; project?: string }) => {
    console.log(kleur.green(`[stub] entity init ${slug}`) + kleur.dim(` · parent=${opts.parent ?? '-'} jurisdiction=${opts.jurisdiction ?? '-'} type=${opts.type ?? '-'} project=${opts.project ?? '-'}`));
  });

entityCmd
  .command('compare')
  .description('Compare jurisdictions side-by-side (support level, costs, manual steps)')
  .requiredOption('--jurisdictions <csv>', 'comma-separated pack codes, e.g. us-delaware,nz,uk,hk')
  .action((opts: { jurisdictions: string }) => {
    console.log(kleur.cyan(`[stub] entity compare · ${opts.jurisdictions}`));
  });

// ---- name-check / plan / docs ----------------------------------------

entityCmd
  .command('name-check <slug>')
  .description('Run the pack name search (or create a manual name-check task)')
  .option('--jurisdiction <code>', 'override the entity jurisdiction')
  .option('--name <name>', 'override the candidate name (defaults to entity.legalName)')
  .action((slug: string, opts: { jurisdiction?: string; name?: string }) => {
    console.log(kleur.cyan(`[stub] entity name-check ${slug}${opts.name ? ` "${opts.name}"` : ''}`));
  });

const planCmd = entityCmd
  .command('plan')
  .description('Formation plan — required inputs, manual steps, recommended filing mode')
  .action(() => { planCmd.help(); });

planCmd
  .command('generate <slug>')
  .description('Generate a formation plan from the pack')
  .action((slug: string) => {
    console.log(kleur.cyan(`[stub] entity plan generate ${slug}`));
  });

const docsCmd = entityCmd
  .command('docs')
  .description('Document bundle — certificate, bylaws/constitution, checklist, filing packet')
  .action(() => { docsCmd.help(); });

docsCmd
  .command('generate <slug>')
  .description('Generate the full document bundle into ./entities/<slug>/')
  .action((slug: string) => {
    console.log(kleur.cyan(`[stub] entity docs generate ${slug}`));
  });

// ---- filing ----------------------------------------------------------

const filingCmd = entityCmd
  .command('filing')
  .description('Filing handoff — direct / assisted / packet-only / provider / stub')
  .action(() => { filingCmd.help(); });

filingCmd
  .command('handoff <slug>')
  .description('Hand off the filing in the selected mode')
  .requiredOption('--mode <mode>', 'direct | assisted | packet-only | provider | stub')
  .action((slug: string, opts: { mode: string }) => {
    console.log(kleur.green(`[stub] entity filing handoff ${slug} · mode=${opts.mode}`));
  });

// ---- compliance / status / audit -------------------------------------

const complianceCmd = entityCmd
  .command('compliance')
  .description('Recurring compliance tasks — annual returns, tax filings, reminders')
  .action(() => { complianceCmd.help(); });

complianceCmd
  .command('enable <slug>')
  .description('Generate the compliance calendar for the entity')
  .action((slug: string) => {
    console.log(kleur.green(`[stub] entity compliance enable ${slug}`));
  });

complianceCmd
  .command('list <slug>')
  .description('Show open / overdue / upcoming compliance tasks')
  .option('--status <status>', 'filter by status (open, blocked, submitted, complete, overdue)')
  .action((slug: string, opts: { status?: string }) => {
    console.log(kleur.dim(`[stub] entity compliance list ${slug}${opts.status ? ` · ${opts.status}` : ''}`));
  });

entityCmd
  .command('status <slug>')
  .description('Show the entity lifecycle state (draft → planned → packet-ready → ... → active)')
  .action((slug: string) => {
    console.log(kleur.dim(`[stub] entity status ${slug}`));
  });

const auditCmd = entityCmd
  .command('audit')
  .description('Immutable audit log of entity actions (jsonl)')
  .action(() => { auditCmd.help(); });

auditCmd
  .command('tail <slug>')
  .description('Stream the audit log for the entity')
  .option('-n <lines>', 'number of lines to show', '20')
  .action((slug: string, opts: { n: string }) => {
    console.log(kleur.dim(`[stub] entity audit tail ${slug} -n ${opts.n}`));
  });

// ---- stub / experimental ---------------------------------------------

const stubCmd = entityCmd
  .command('stub')
  .description('Stub pack operations — model an entity in an unsupported jurisdiction')
  .action(() => { stubCmd.help(); });

stubCmd
  .command('init <jurisdiction>')
  .description('Initialise a stub-pack workspace (e.g. india, south-africa, nigeria)')
  .option('--entity-type <type>', 'override the default entity type for the stub')
  .action((jurisdiction: string, opts: { entityType?: string }) => {
    console.log(kleur.yellow(`[stub] entity stub init ${jurisdiction}${opts.entityType ? ` · ${opts.entityType}` : ''}`));
  });

const expCmd = entityCmd
  .command('experimental')
  .description('Experimental packs — behind a feature flag, narrow use cases only')
  .action(() => { expCmd.help(); });

expCmd
  .command('init <pack>')
  .description('Initialise an experimental workspace (e.g. dao-wy)')
  .option('--type <type>', 'entity type (dao-llc for dao-wy)')
  .action((pack: string, opts: { type?: string }) => {
    console.log(kleur.magenta(`[stub] entity experimental init ${pack}${opts.type ? ` · ${opts.type}` : ''}`));
  });
