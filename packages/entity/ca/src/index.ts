import { defineJurisdiction, type EntityType } from '@sh1pt/core';

// Canada pack — Read/Compliance support. Federal CBCA incorporation
// via Corporations Canada online + provincial equivalents. Pack does
// status sync + compliance calendar; incorporation stays packet-only
// because provincial paths differ (ON/BC/AB/QC each have their own
// portal). Promote to Assisted once we pick a federal-first flow.
interface Config { jurisdiction?: 'federal' | 'ON' | 'BC' | 'AB' | 'QC' }

const SUPPORTED_TYPES: EntityType[] = ['company', 'private-company', 'nonprofit'];

export default defineJurisdiction<Config>({
  id: 'entity-ca',
  label: 'Canada',

  describe() {
    return {
      packId: 'entity-ca',
      jurisdictionCode: 'ca',
      displayName: 'Canada',
      supportLevel: 'read-compliance',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['packet-only', 'provider'],
      experimental: false,
      version: '0.1.0',
      requiredManualSteps: ['choose federal vs. provincial', 'NUANS name search (CDN$13.80)', 'file articles directly'],
      requiredInputs: ['directors', 'registered-office', 'share-structure'],
      artifactExpectations: ['articles-of-incorporation', 'form-2-registered-office', 'form-6-directors'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type) };
  },

  async searchName(ctx, name) {
    ctx.log(`ca · name-check ${name}`);
    // NUANS searches are paid — pack doesn't auto-trigger. User runs it.
    return { name, normalized: name.toLowerCase(), availability: 'manual', checkedAt: new Date().toISOString(), notes: 'NUANS search required (paid) before filing' };
  },

  async generatePlan(ctx, entity) {
    ctx.log(`ca · plan ${entity.slug}`);
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-ca',
      selectedEntityType: entity.entityType,
      supportLevel: 'read-compliance',
      requiredInputs: ['NUANS-report', 'director-residency-confirmation', 'registered-office'],
      manualSteps: ['commission NUANS name search', 'file articles via Corporations Canada online or provincial portal'],
      recommendedMode: 'packet-only',
      blockers: ['NUANS report not yet obtained'],
      postFormationTasks: ['CRA Business Number + program accounts', 'provincial tax accounts (PST/QST where applicable)', 'initial return within 60 days (federal)'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`ca · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/articles.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: ['NUANS-report'],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`ca · handoff ${entity.slug} mode=${mode}`);
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode: 'packet-only', nextAction: 'file via Corporations Canada online or selected provincial portal' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`ca · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'annual-return', title: 'Corporations Canada annual return', description: 'Filed within 60 days of anniversary of incorporation (federal CBCA).', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 't2', title: 'CRA T2 corporate income tax return', description: 'Due 6 months after fiscal year end.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 60 },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`ca · status ${entity.slug}`);
    // TODO: ic.gc.ca/app/scr/cc — federal corp search.
    return { status: entity.status };
  },
});
