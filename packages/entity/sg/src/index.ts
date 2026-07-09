import { defineJurisdiction, type EntityType, manualSetup } from '@profullstack/sh1pt-core';

// Singapore pack — Read/Compliance support. ACRA BizFile+ is one of the
// cleanest registries globally (most incorporations complete in <1 day).
// Filing still requires a SingPass-authenticated user OR a licensed
// corporate service provider (filing agent). Pack handles status +
// compliance; promote to Assisted once filing-agent integration lands.
interface Config { corporateServiceProvider?: string }

const SUPPORTED_TYPES: EntityType[] = ['private-company', 'limited-company'];

export default defineJurisdiction<Config>({
  id: 'entity-sg',
  label: 'Singapore',

  describe() {
    return {
      packId: 'entity-sg',
      jurisdictionCode: 'sg',
      displayName: 'Singapore',
      supportLevel: 'read-compliance',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['packet-only', 'provider'],
      experimental: false,
      version: '0.1.0',
      requiredManualSteps: ['SingPass or corporate service provider', 'local resident director', 'company secretary within 6 months'],
      requiredInputs: ['company-name', 'directors', 'shareholders', 'registered-office', 'constitution'],
      artifactExpectations: ['constitution', 'form-45', 'first-directors-resolution'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type) };
  },

  async searchName(ctx, name) {
    ctx.log(`sg · name-check ${name}`);
    // TODO: ACRA name application (paid, ~S$15).
    return { name, normalized: name.toLowerCase(), availability: 'unknown', checkedAt: new Date().toISOString() };
  },

  async generatePlan(ctx, entity) {
    ctx.log(`sg · plan ${entity.slug}`);
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-sg',
      selectedEntityType: entity.entityType,
      supportLevel: 'read-compliance',
      requiredInputs: ['local-resident-director-id', 'registered-office-address', 'SSIC-code'],
      manualSteps: ['appoint SG-resident director', 'engage corporate service provider (if no SingPass access)'],
      recommendedMode: 'provider',
      blockers: [],
      postFormationTasks: ['appoint company secretary within 6 months', 'register for GST (if turnover > SGD 1M)', 'open bank account', 'first AGM within 18 months'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`sg · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/constitution.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: [],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`sg · handoff ${entity.slug} mode=${mode}`);
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode: 'provider', nextAction: 'engage corporate service provider or file via SingPass on BizFile+' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`sg · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'annual-return', title: 'ACRA annual return', description: 'Filed within 7 months of FYE for non-listed companies.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 45 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 'form-cs', title: 'IRAS Form C / C-S corporate tax return', description: 'Due 30 November each year.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 60 },
      { taskId: `t_${Date.now()}_3`, entityId: entity.entityId, taskType: 'agm', title: 'Hold Annual General Meeting', description: 'Within 6 months of FYE (unless exempt).', status: 'open', recurrence: 'yearly' },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`sg · status ${entity.slug}`);
    return { status: entity.status };
  },

  setup: manualSetup({
    label: "Singapore (ACRA)",
    vendorDocUrl: "https://www.acra.gov.sg/",
    steps: [
      "Singapore (ACRA) pack supplies entity-formation rules + filing templates.",
      "No credentials needed here \u2014 this is static jurisdiction data.",
      "Actual filings happen through the provider specified in sh1pt.config.ts.",
    ],
  }),
});
