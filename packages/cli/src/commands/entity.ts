import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import kleur from 'kleur';
import type { EntityType, JurisdictionDescribe } from '@profullstack/sh1pt-core';

const KNOWN_PACKS = [
  'au', 'bb', 'bw', 'ca', 'dao-wy', 'fj', 'gh', 'hk',
  'ie', 'in', 'jm', 'ke', 'my', 'ng', 'nz', 'pk',
  'sg', 'tt', 'tz', 'ug', 'uk', 'us', 'za', 'zm', 'zw',
] as const;

// `sh1pt entity` — auxiliary command for entity-ops (formation + name
// checks + doc generation + filing handoff + compliance tracking).
// Cross-cuts the 4 primary verbs so it lives top-level alongside
// login/secret/config. Packs live under packages/entity/* and implement
// the JurisdictionPack interface in @profullstack/sh1pt-core.
export const entityCmd = new Command('entity')
  .description('Entity operations — formation, compliance, spinouts (uses jurisdiction packs)')
  .action(() => { entityCmd.help(); });

const ENTITY_ROOT = '.sh1pt/entities';
const ENTITY_TYPES = new Set<EntityType>(['c-corp', 's-corp', 'llc', 'benefit-corp', 'nonprofit']);

interface DraftEntity {
  entityId: string;
  slug: string;
  legalName: string;
  jurisdiction: string;
  entityType: EntityType;
  status: 'draft';
  tracks: {
    formation_ready: false;
    exemption_ready: false;
    finance_ready: false;
    compliance_ready: false;
  };
  createdAt: string;
}

function printJsonOrText(value: unknown, json?: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function entityPath(slug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Entity slug must be lowercase kebab-case');
  return resolve(ENTITY_ROOT, slug, 'entity.json');
}

function readDraft(slug: string): DraftEntity {
  const path = entityPath(slug);
  if (!existsSync(path)) throw new Error(`Entity draft not found: ${slug}`);
  return JSON.parse(readFileSync(path, 'utf8')) as DraftEntity;
}

// ---- planning preview ------------------------------------------------
entityCmd
  .command('init <slug>')
  .description('Create a local entity draft (planning only; no external side effects)')
  .requiredOption('--type <type>', 'nonprofit, llc, c-corp, s-corp, or benefit-corp')
  .requiredOption('--jurisdiction <code>', 'formation/operating jurisdiction, e.g. US-CA')
  .option('--legal-name <name>', 'legal name (defaults to slug)')
  .option('--json')
  .action((slug: string, options: { type: string; jurisdiction: string; legalName?: string; json?: boolean }) => {
    const entityType = options.type as EntityType;
    if (!ENTITY_TYPES.has(entityType)) throw new Error(`Unsupported entity type: ${options.type}`);
    const path = entityPath(slug);
    if (existsSync(path)) throw new Error(`Entity draft already exists: ${slug}`);
    const now = new Date().toISOString();
    const entity: DraftEntity = {
      entityId: `ent_${createHash('sha256').update(`${slug}:${now}`).digest('hex').slice(0, 16)}`,
      slug,
      legalName: options.legalName?.trim() || slug,
      jurisdiction: options.jurisdiction.toUpperCase(),
      entityType,
      status: 'draft',
      tracks: { formation_ready: false, exemption_ready: false, finance_ready: false, compliance_ready: false },
      createdAt: now,
    };
    mkdirSync(resolve(ENTITY_ROOT, slug), { recursive: true });
    writeFileSync(path, `${JSON.stringify(entity, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    printJsonOrText(entity, options.json);
  });

entityCmd
  .command('plan generate <slug>')
  .description('Generate a deterministic dry-run plan for an entity draft')
  .option('--dry-run', 'required; retained for explicitness', true)
  .option('--json')
  .action((slug: string, options: { json?: boolean }) => {
    const entity = readDraft(slug);
    const jurisdiction = entity.jurisdiction;
    const blockers = jurisdiction !== 'US-CA'
      ? [`Jurisdiction ${jurisdiction} is not in the reviewed US-CA preview pack`]
      : ['Provider filing route requires review before any submission'];
    if (entity.entityType === 'nonprofit') blockers.push('Federal exemption recognition is a separate post-incorporation track');
    const plan = {
      planId: `plan_${createHash('sha256').update(JSON.stringify(entity)).digest('hex').slice(0, 16)}`,
      entityId: entity.entityId,
      inputs: entity,
      tracks: entity.tracks,
      tasks: [
        { id: 'jurisdiction-assessment', state: 'needs_review', reason: 'Confirm operating locations, registration, tax, and licensing obligations' },
        { id: 'formation-packet', state: 'draft', reason: 'Prepare reviewed documents; packet is not filed' },
        { id: 'ein', state: 'not_started', reason: 'Authority and existing-EIN check required' },
        ...(entity.entityType === 'nonprofit' ? [{ id: 'exemption', state: 'screening', reason: 'Incorporation does not establish federal exemption' }] : []),
        { id: 'banking', state: 'unavailable', reason: 'No financial product is available without exact-profile verified SimpleFIN evidence' },
        { id: 'compliance', state: 'needs_review', reason: 'Generate obligations from reviewed jurisdiction rules' },
      ],
      blockers,
      sideEffects: 'none',
      generatedAt: new Date().toISOString(),
    };
    printJsonOrText(plan, options.json);
  });

entityCmd
  .command('status <slug>')
  .description('Show independent readiness tracks for an entity draft')
  .option('--json')
  .action((slug: string, options: { json?: boolean }) => {
    const entity = readDraft(slug);
    printJsonOrText({ entityId: entity.entityId, slug: entity.slug, status: entity.status, tracks: entity.tracks }, options.json);
  });

entityCmd
  .command('banking products <slug>')
  .description('List products available under the mandatory SimpleFIN qualification gate')
  .option('--simplefin <state>', 'must be verified to return available products')
  .option('--json')
  .action((slug: string, options: { simplefin?: string; json?: boolean }) => {
    const entity = readDraft(slug);
    const result = {
      entityId: entity.entityId,
      products: [],
      unavailableReason: options.simplefin === 'verified'
        ? 'No exact-profile product qualification has been configured in the planning preview'
        : 'SIMPLEFIN_UNVERIFIED: products require current exact-profile SimpleFIN evidence',
    };
    printJsonOrText(result, options.json);
  });

// ---- pack ------------------------------------------------------------
const packCmd = entityCmd
  .command('pack')
  .description('Jurisdiction pack registry — list, inspect support level')
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
    console.log('─'.repeat(70));
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
      if (d.experimental) console.log(kleur.magenta('  ⚠ experimental'));
    } catch {
      console.error(kleur.red(`pack not found: ${code}`)); process.exit(1);
    }
  });
