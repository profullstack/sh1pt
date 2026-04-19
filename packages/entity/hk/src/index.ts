import { defineJurisdiction, type EntityType } from '@sh1pt/core';

// HK pack — Assisted support. Companies Registry e-Registry
// (e-services.cr.gov.hk) offers online incorporation for private
// companies limited by shares. Pack generates NNC1 + articles; user
// signs + submits via e-Registry login.
interface Config { eRegistryAccount?: string }

const SUPPORTED_TYPES: EntityType[] = ['limited-company', 'private-company'];

export default defineJurisdiction<Config>({
  id: 'entity-hk',
  label: 'Hong Kong',

  describe() {
    return {
      packId: 'entity-hk',
      jurisdictionCode: 'hk',
      displayName: 'Hong Kong',
      supportLevel: 'assisted',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['assisted', 'packet-only', 'provider'],
      experimental: false,
      version: '0.1.0',
      requiredManualSteps: ['e-Registry account', 'company-secretary (HK resident) engagement'],
      requiredInputs: ['english-name', 'chinese-name?', 'directors', 'registered-office', 'share-capital'],
      artifactExpectations: ['NNC1', 'articles-of-association', 'IR56B'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type), reason: SUPPORTED_TYPES.includes(type) ? undefined : `HK pack does not support ${type}` };
  },

  async searchName(ctx, name) {
    ctx.log(`hk · name-check ${name}`);
    // TODO: Cyber Search Centre name lookup (fee per search).
    return { name, normalized: name.toLowerCase(), availability: 'unknown', checkedAt: new Date().toISOString() };
  },

  async generatePlan(ctx, entity) {
    ctx.log(`hk · plan ${entity.slug}`);
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-hk',
      selectedEntityType: entity.entityType,
      supportLevel: 'assisted',
      requiredInputs: ['HK-resident-company-secretary', 'registered-office-address', 'shareholders'],
      manualSteps: ['appoint HK-resident company secretary', 'sign NNC1'],
      recommendedMode: 'assisted',
      blockers: [],
      postFormationTasks: ['apply for Business Registration Certificate (IRD)', 'open HK bank account', 'significant controllers register'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`hk · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'plan', relativePath: 'plan.md', format: 'md' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/NNC1.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/articles.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: [],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`hk · handoff ${entity.slug} mode=${mode}`);
    if (ctx.dryRun) return { handoffId: 'dry-run', entityId: entity.entityId, mode, nextAction: 'dry-run' };
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode, nextAction: 'submit via e-Registry with e-Certificate' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`hk · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'annual-return', title: 'Annual return (NAR1)', description: 'Due within 42 days of anniversary of incorporation.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 'brc-renewal', title: 'Business Registration Certificate renewal', description: 'Annual or triennial renewal with IRD.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
      { taskId: `t_${Date.now()}_3`, entityId: entity.entityId, taskType: 'profits-tax', title: 'Profits Tax return', description: 'Issued by IRD; due ~1 month after issue (extensions common).', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`hk · status ${entity.slug}`);
    return { status: entity.status };
  },
});
