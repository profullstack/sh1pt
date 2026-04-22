import { defineJurisdiction, type EntityType } from '@profullstack/sh1pt-core';

// India — Stub pack. Exists from day 1 so an entity can be modeled
// and artifacts can be stubbed, but no live registry lookup or filing
// is wired up. Upgrade path: promote to 'assisted' once a registry
// surface + reliable filing flow is scoped.
interface Config { /* reserved */ }

const SUPPORTED_TYPES: EntityType[] = ['private-company', 'limited-company', 'other'];

export default defineJurisdiction<Config>({
  id: 'entity-in',
  label: 'India',

  describe() {
    return {
      packId: 'entity-in',
      jurisdictionCode: 'in',
      displayName: 'India',
      supportLevel: 'stub',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['stub', 'packet-only'],
      experimental: false,
      version: '0.0.1',
      requiredManualSteps: ['research local registry process', 'engage local counsel'],
      requiredInputs: ['local-contact', 'registered-address'],
      artifactExpectations: ['manual-checklist'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type), reason: SUPPORTED_TYPES.includes(type) ? undefined : 'India stub pack does not enumerate this type yet' };
  },

  async searchName(ctx, name) {
    ctx.log('in · name-check (stub) ' + name);
    return { name, normalized: name.toLowerCase(), availability: 'unknown', checkedAt: new Date().toISOString(), notes: 'stub pack — manual name check required' };
  },

  async generatePlan(ctx, entity) {
    ctx.log('in · plan (stub) ' + entity.slug);
    return {
      planId: 'p_' + Date.now(),
      entityId: entity.entityId,
      selectedPackId: 'entity-in',
      selectedEntityType: entity.entityType,
      supportLevel: 'stub',
      requiredInputs: ['local-counsel', 'registered-office', 'director-ids'],
      manualSteps: ['research India incorporation process', 'prepare documents with local counsel', 'file directly with local registry'],
      recommendedMode: 'packet-only',
      blockers: ['no automated registry integration'],
      postFormationTasks: ['register for local tax ID', 'open local bank account'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log('in · docs (stub) ' + entity.slug);
    return {
      bundleId: 'b_' + Date.now(),
      entityId: entity.entityId,
      workspacePath: './entities/' + entity.slug,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: ['automated-document-generation'],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log('in · handoff (stub) ' + entity.slug + ' mode=' + mode);
    return { handoffId: 'dry-run', entityId: entity.entityId, mode: 'stub', nextAction: 'engage local counsel; no automated submission in stub pack' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log('in · compliance (stub) ' + entity.slug);
    return [
      { taskId: 't_' + Date.now(), entityId: entity.entityId, taskType: 'manual-review', title: 'Review India ongoing compliance obligations with local counsel', description: 'Stub pack — no automated compliance calendar yet.', status: 'open', recurrence: 'once' },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log('in · status (stub) ' + entity.slug);
    return { status: entity.status };
  },
});
