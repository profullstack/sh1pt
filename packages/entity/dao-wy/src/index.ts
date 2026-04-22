import { defineJurisdiction, type EntityType } from '@profullstack/sh1pt-core';

// Wyoming DAO LLC wrapper — EXPERIMENTAL. Wyoming is the only US state
// with a DAO-specific LLC statute (W.S. 17-31). This pack creates the
// legal wrapper only: articles of organization with the DAO addendum,
// operating agreement referencing a smart-contract-governed member
// register, and annual-report compliance.
//
// What this pack DOES NOT do:
//   - token issuance or securities analysis (out of scope per PRD §10)
//   - on-chain governance tooling
//   - treasury management
//   - cap-table replacement
//
// For those, users are referred to specialised counsel + existing DAO
// tooling (Aragon, Safe, Snapshot). We build the legal wrapper only.
interface Config {
  registeredAgent?: string;
  smartContractAddress?: string;    // referenced in operating agreement
  managementType?: 'algorithmically-managed' | 'member-managed';
}

const SUPPORTED_TYPES: EntityType[] = ['dao-llc'];

export default defineJurisdiction<Config>({
  id: 'entity-dao-wy',
  label: 'Wyoming DAO LLC (Experimental)',

  describe() {
    return {
      packId: 'entity-dao-wy',
      jurisdictionCode: 'us-wyoming-dao',
      displayName: 'Wyoming DAO LLC',
      supportLevel: 'experimental',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['packet-only', 'provider'],
      experimental: true,
      version: '0.0.1',
      requiredManualSteps: [
        'engage Wyoming-licensed registered agent',
        'draft operating agreement with smart-contract references',
        'legal review — this is a novel entity type',
        'file Articles of Organization with DAO addendum (WY SoS)',
      ],
      requiredInputs: ['smart-contract-address', 'management-type', 'members'],
      artifactExpectations: ['articles-of-organization-dao', 'operating-agreement', 'consent-of-registered-agent'],
    };
  },

  validateEntityType(type) {
    return { ok: type === 'dao-llc', reason: type === 'dao-llc' ? undefined : 'DAO-WY pack only supports dao-llc — experimental wrapper' };
  },

  async searchName(ctx, name) {
    ctx.log(`dao-wy · name-check ${name} (experimental)`);
    // WY name availability via wyobiz.wyo.gov — same as regular LLC.
    return { name, normalized: name.toLowerCase(), availability: 'unknown', checkedAt: new Date().toISOString(), notes: 'WY DAO LLC name must end with "DAO LLC" or "LAO"' };
  },

  async generatePlan(ctx, entity) {
    ctx.log(`dao-wy · plan ${entity.slug} (experimental)`);
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-dao-wy',
      selectedEntityType: 'dao-llc',
      supportLevel: 'experimental',
      requiredInputs: ['smart-contract-address', 'management-type', 'initial-members'],
      manualSteps: [
        'engage counsel familiar with W.S. 17-31',
        'finalize operating agreement',
        'file Articles of Organization with DAO designation',
      ],
      recommendedMode: 'packet-only',
      blockers: [
        'legal review recommended — experimental entity type',
        'token/securities analysis explicitly out of scope',
      ],
      postFormationTasks: ['annual report (due 1st day of anniversary month)', 'EIN via SS-4', 'open US bank account'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`dao-wy · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/articles-of-organization-dao.md', format: 'md' },
        { kind: 'governance-doc', relativePath: 'docs/operating-agreement.md', format: 'md' },
        { kind: 'governance-doc', relativePath: 'docs/experimental-disclaimer.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: [],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`dao-wy · handoff ${entity.slug} mode=${mode}`);
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode: 'packet-only', nextAction: 'file with Wyoming SoS via wyobiz.wyo.gov or via registered agent' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`dao-wy · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'wy-annual-report', title: 'Wyoming annual report + license tax', description: 'Due 1st day of anniversary month; minimum $60.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 30 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 'bo-report', title: 'FinCEN Beneficial Ownership (BOI) report', description: 'Required for most US-formed entities.', status: 'open', recurrence: 'once' },
      { taskId: `t_${Date.now()}_3`, entityId: entity.entityId, taskType: 'registered-agent', title: 'Maintain Wyoming registered agent', description: 'DAO LLC must keep a WY-licensed agent at all times.', status: 'open', recurrence: 'yearly' },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`dao-wy · status ${entity.slug}`);
    return { status: entity.status };
  },
});
