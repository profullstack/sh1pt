import { defineJurisdiction, type EntityType } from '@profullstack/sh1pt-core';

// Ireland pack — Read/Compliance support. CRO (cro.ie) runs CORE portal
// for online incorporation (Company Bureau / A1-online); pack surfaces
// status + annual return (B1) calendar. Incorporation stays packet-only
// until CORE credential + ROS integration is scoped.
interface Config { roNumber?: string }

const SUPPORTED_TYPES: EntityType[] = ['limited-company', 'plc', 'llp'];

export default defineJurisdiction<Config>({
  id: 'entity-ie',
  label: 'Ireland',

  describe() {
    return {
      packId: 'entity-ie',
      jurisdictionCode: 'ie',
      displayName: 'Ireland',
      supportLevel: 'read-compliance',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['packet-only', 'provider'],
      experimental: false,
      version: '0.1.0',
      requiredManualSteps: ['CORE account', 'EEA-resident director OR bond for non-EEA directors', 'ROS registration for tax'],
      requiredInputs: ['company-name', 'directors', 'secretary', 'registered-office', 'constitution'],
      artifactExpectations: ['A1', 'constitution', 'beneficial-ownership-register'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type) };
  },

  async searchName(ctx, name) {
    ctx.log(`ie · name-check ${name}`);
    // TODO: CRO CORE name search.
    return { name, normalized: name.toLowerCase(), availability: 'unknown', checkedAt: new Date().toISOString() };
  },

  async generatePlan(ctx, entity) {
    ctx.log(`ie · plan ${entity.slug}`);
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-ie',
      selectedEntityType: entity.entityType,
      supportLevel: 'read-compliance',
      requiredInputs: ['director-residency', 'registered-office-address', 'constitution-text'],
      manualSteps: ['file A1 via CORE', 'register with ROS for Corporation Tax + VAT + PAYE'],
      recommendedMode: 'packet-only',
      blockers: [],
      postFormationTasks: ['RBO beneficial ownership filing within 5 months', 'ROS tax registration', 'first annual return 6 months after incorporation'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`ie · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/A1.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/constitution.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: [],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`ie · handoff ${entity.slug} mode=${mode}`);
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode: 'packet-only', nextAction: 'submit A1 via CRO CORE' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`ie · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'b1', title: 'CRO annual return (Form B1)', description: 'Due annually to the CRO; linked to annual return date.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 'ct1', title: 'Revenue CT1 corporation tax return', description: 'Due 9 months after accounting period end (23rd of the month).', status: 'open', recurrence: 'yearly', reminderDaysBefore: 45 },
      { taskId: `t_${Date.now()}_3`, entityId: entity.entityId, taskType: 'rbo', title: 'RBO beneficial ownership update', description: 'Initial filing within 5 months; updates within 14 days of changes.', status: 'open', recurrence: 'once' },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`ie · status ${entity.slug}`);
    return { status: entity.status };
  },
});
