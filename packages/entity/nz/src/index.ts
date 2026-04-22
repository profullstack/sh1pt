import { defineJurisdiction, type EntityType } from '@profullstack/sh1pt-core';

// NZ pack — Full support. Companies Office (companies-register.companiesoffice.govt.nz)
// has one of the cleanest registry surfaces in the English-speaking world:
// live name reservation, online incorporation, annual-return filing all
// through a single RealMe-authenticated API. IRD (tax) is separate and
// stays manual for now.
interface Config {
  realMeId?: string;                // NZ digital identity
  directorIrdNumbers?: string[];    // required for all company directors
}

const SUPPORTED_TYPES: EntityType[] = ['company', 'limited-company'];

export default defineJurisdiction<Config>({
  id: 'entity-nz',
  label: 'New Zealand',

  describe() {
    return {
      packId: 'entity-nz',
      jurisdictionCode: 'nz',
      displayName: 'New Zealand',
      supportLevel: 'full',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['direct', 'assisted', 'packet-only'],
      experimental: false,
      version: '0.1.0',
      requiredManualSteps: ['RealMe login for incorporation', 'IRD number application'],
      requiredInputs: ['company-name', 'directors', 'shareholders', 'registered-office'],
      artifactExpectations: ['constitution', 'application-form-INC1', 'share-register'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type), reason: SUPPORTED_TYPES.includes(type) ? undefined : `NZ pack does not support ${type}` };
  },

  async searchName(ctx, name) {
    ctx.log(`nz · name-check ${name}`);
    // TODO: GET companies-register.companiesoffice.govt.nz/name-reservation?q=
    return { name, normalized: name.toLowerCase(), availability: 'unknown', checkedAt: new Date().toISOString() };
  },

  async generatePlan(ctx, entity) {
    ctx.log(`nz · plan ${entity.slug}`);
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-nz',
      selectedEntityType: entity.entityType,
      supportLevel: 'full',
      requiredInputs: ['director-ird-numbers', 'registered-office-address', 'share-allocation'],
      manualSteps: ['obtain RealMe login', 'director consent forms'],
      recommendedMode: 'direct',
      blockers: [],
      postFormationTasks: ['IRD number + GST registration (if >NZD 60k turnover)', 'open bank account', 'first annual return within 12 months'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`nz · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'plan', relativePath: 'plan.md', format: 'md' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/constitution.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/INC1.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: [],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`nz · handoff ${entity.slug} mode=${mode}`);
    if (ctx.dryRun) return { handoffId: 'dry-run', entityId: entity.entityId, mode, nextAction: 'dry-run' };
    // TODO: POST to Companies Office online incorporation API.
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode, nextAction: 'review packet; submit via Companies Office' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`nz · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'annual-return', title: 'Companies Office annual return', description: 'Filed in the month of the anniversary of incorporation.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 'ir4', title: 'IR4 company income tax return', description: 'Due July 7 for standard balance dates.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 60 },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`nz · status ${entity.slug}`);
    return { status: entity.status };
  },
});
