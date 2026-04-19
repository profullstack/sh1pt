import { defineJurisdiction, type EntityType } from '@sh1pt/core';

// AU pack — Assisted support. ASIC Connect for name reservation and
// proprietary company registration (Form 201). ABR issues ABN + TFN
// separately (free). Pack generates payloads; user files through ASIC
// portal or via ASIC-registered agent (preferred for bulk).
interface Config { asicAgent?: string }

const SUPPORTED_TYPES: EntityType[] = ['private-company', 'public-company', 'company'];

export default defineJurisdiction<Config>({
  id: 'entity-au',
  label: 'Australia',

  describe() {
    return {
      packId: 'entity-au',
      jurisdictionCode: 'au',
      displayName: 'Australia',
      supportLevel: 'assisted',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['assisted', 'packet-only', 'provider'],
      experimental: false,
      version: '0.1.0',
      requiredManualSteps: ['ASIC account or registered agent', 'director ID from ABRS'],
      requiredInputs: ['company-name', 'directors', 'member-register', 'registered-office', 'share-structure'],
      artifactExpectations: ['form-201', 'constitution', 'consent-to-act-forms'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type), reason: SUPPORTED_TYPES.includes(type) ? undefined : `AU pack does not support ${type}` };
  },

  async searchName(ctx, name) {
    ctx.log(`au · name-check ${name}`);
    // TODO: ASIC Connect organisations-and-business-names search.
    return { name, normalized: name.toLowerCase(), availability: 'unknown', checkedAt: new Date().toISOString() };
  },

  async generatePlan(ctx, entity) {
    ctx.log(`au · plan ${entity.slug}`);
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-au',
      selectedEntityType: entity.entityType,
      supportLevel: 'assisted',
      requiredInputs: ['director-id', 'tfn', 'registered-office-address'],
      manualSteps: ['all directors obtain director ID via ABRS', 'consent-to-act signed by each officer'],
      recommendedMode: 'assisted',
      blockers: [],
      postFormationTasks: ['register for ABN + TFN via ABR', 'GST registration (if turnover > AUD 75k)', 'PAYG withholding if hiring'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`au · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'plan', relativePath: 'plan.md', format: 'md' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/form-201.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/constitution.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: [],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`au · handoff ${entity.slug} mode=${mode}`);
    if (ctx.dryRun) return { handoffId: 'dry-run', entityId: entity.entityId, mode, nextAction: 'dry-run' };
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode, nextAction: 'submit via ASIC Connect or registered agent' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`au · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'annual-review', title: 'ASIC annual review', description: 'Pay annual review fee and confirm company details within 2 months of review date.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 'company-tax', title: 'ATO company tax return', description: 'Due 15 May (for late-balancing entities with a tax agent).', status: 'open', recurrence: 'yearly', reminderDaysBefore: 60 },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`au · status ${entity.slug}`);
    return { status: entity.status };
  },
});
