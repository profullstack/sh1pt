import { defineJurisdiction, type EntityType, manualSetup } from '@profullstack/sh1pt-core';

// US pack — Full support. Delaware C-Corp is the default startup path;
// the adapter also handles state-by-state LLC / S-Corp / benefit-corp
// formation. Live name search against state Secretary-of-State portals
// (DE, CA, NY, WY are priority); EIN is a post-formation checklist item
// (IRS does not support true API filing — SS-4 is generated, user faxes
// or files through IRS online wizard).
interface Config {
  state?: string;                   // 'DE', 'CA', 'NY', 'WY', …
  registeredAgent?: string;         // agent package deal (Harvard, LegalZoom, NR)
}

const SUPPORTED_TYPES: EntityType[] = ['c-corp', 's-corp', 'llc', 'benefit-corp', 'nonprofit'];

export default defineJurisdiction<Config>({
  id: 'entity-us',
  label: 'United States',

  describe() {
    return {
      packId: 'entity-us',
      jurisdictionCode: 'us',
      displayName: 'United States',
      supportLevel: 'full',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['direct', 'assisted', 'packet-only', 'provider'],
      experimental: false,
      version: '0.1.0',
      requiredManualSteps: ['EIN application (IRS SS-4)', 'open business bank account'],
      requiredInputs: ['state', 'registered-agent', 'incorporator-name', 'par-value-shares'],
      artifactExpectations: ['certificate-of-incorporation', 'bylaws', 'action-of-incorporator', 'SS-4'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type), reason: SUPPORTED_TYPES.includes(type) ? undefined : `US pack does not support ${type}` };
  },

  async searchName(ctx, name) {
    ctx.log(`us · name-check ${name}`);
    // TODO: state-specific SoS name availability search. DE uses
    // icis.corp.delaware.gov; CA uses bizfileonline.sos.ca.gov; etc.
    return { name, normalized: name.toLowerCase(), availability: 'unknown', checkedAt: new Date().toISOString() };
  },

  async generatePlan(ctx, entity, config) {
    ctx.log(`us · plan ${entity.slug} (${entity.entityType})`);
    const state = config?.state ?? 'DE';
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-us',
      selectedEntityType: entity.entityType,
      supportLevel: 'full',
      requiredInputs: ['registered-agent-address', 'incorporator-name', 'authorized-shares'],
      manualSteps: ['sign certificate of incorporation', 'hold organizational meeting'],
      recommendedMode: state === 'DE' ? 'direct' : 'assisted',
      blockers: [],
      postFormationTasks: ['apply for EIN (SS-4)', 'open bank account', 'file BOI report (FinCEN)', 'issue founder stock', '83(b) elections within 30 days'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`us · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'plan', relativePath: 'plan.md', format: 'md' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/certificate-of-incorporation.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/bylaws.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/SS-4.md', format: 'md' },
        { kind: 'governance-doc', relativePath: 'docs/action-of-incorporator.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: [],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`us · handoff ${entity.slug} mode=${mode}`);
    if (ctx.dryRun) return { handoffId: 'dry-run', entityId: entity.entityId, mode, nextAction: 'dry-run' };
    // TODO: for 'direct' on DE/WY/CA, POST to the state portal. For
    // 'assisted', generate the exact fields the filer pastes. For
    // 'provider', route to Clerky / Stripe Atlas / Firstbase.
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode, nextAction: 'review generated packet and submit via selected mode' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`us · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'franchise-tax', title: 'Delaware franchise tax + annual report', description: 'Due March 1 each year for corporations.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 'bo-report', title: 'FinCEN Beneficial Ownership (BOI) report', description: 'File within 30 days of formation; update within 30 days of any change.', status: 'open', recurrence: 'once' },
      { taskId: `t_${Date.now()}_3`, entityId: entity.entityId, taskType: 'federal-tax', title: 'Form 1120 federal income tax (C-Corp)', description: 'Due April 15 (or 15th day of 4th month after fiscal year end).', status: 'open', recurrence: 'yearly', reminderDaysBefore: 45 },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`us · status ${entity.slug}`);
    // TODO: hit state SoS lookup, parse registered/forfeited/dissolved.
    return { status: entity.status };
  },

  setup: manualSetup({
    label: "United States",
    vendorDocUrl: "https://www.sba.gov/",
    steps: [
      "United States pack supplies entity-formation rules + filing templates.",
      "No credentials needed here \u2014 this is static jurisdiction data.",
      "Actual filings happen through the provider specified in sh1pt.config.ts.",
    ],
  }),
});
