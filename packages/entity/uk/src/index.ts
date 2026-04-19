import { defineJurisdiction, type EntityType } from '@sh1pt/core';

// UK pack — Assisted support. Companies House has a public API
// (api.company-information.service.gov.uk) for name/company lookup,
// and WebFiling/Software Filing for incorporation (requires presenter
// credentials). We generate payloads + guide the user; don't submit
// on their behalf until presenter auth is vaulted.
interface Config {
  presenterId?: string;
  authCode?: string;
}

const SUPPORTED_TYPES: EntityType[] = ['limited-company', 'llp', 'plc', 'sole-trader'];

export default defineJurisdiction<Config>({
  id: 'entity-uk',
  label: 'United Kingdom',

  describe() {
    return {
      packId: 'entity-uk',
      jurisdictionCode: 'uk',
      displayName: 'United Kingdom',
      supportLevel: 'assisted',
      entityTypesSupported: SUPPORTED_TYPES,
      filingModesSupported: ['assisted', 'packet-only', 'provider'],
      experimental: false,
      version: '0.1.0',
      requiredManualSteps: ['Companies House presenter credentials', 'anti-money-laundering check for directors'],
      requiredInputs: ['company-name', 'directors', 'PSCs', 'registered-office', 'SIC-codes'],
      artifactExpectations: ['IN01', 'articles-of-association', 'memorandum'],
    };
  },

  validateEntityType(type) {
    return { ok: SUPPORTED_TYPES.includes(type), reason: SUPPORTED_TYPES.includes(type) ? undefined : `UK pack does not support ${type}` };
  },

  async searchName(ctx, name) {
    ctx.log(`uk · name-check ${name}`);
    // TODO: GET api.company-information.service.gov.uk/search/companies?q=
    return { name, normalized: name.toLowerCase().replace(/\s+/g, ' '), availability: 'unknown', checkedAt: new Date().toISOString() };
  },

  async generatePlan(ctx, entity) {
    ctx.log(`uk · plan ${entity.slug}`);
    return {
      planId: `p_${Date.now()}`,
      entityId: entity.entityId,
      selectedPackId: 'entity-uk',
      selectedEntityType: entity.entityType,
      supportLevel: 'assisted',
      requiredInputs: ['SIC-codes', 'PSC-details', 'share-capital'],
      manualSteps: ['obtain Companies House presenter ID', 'director AML checks'],
      recommendedMode: 'assisted',
      blockers: [],
      postFormationTasks: ['register for Corporation Tax', 'VAT registration (if turnover > £90k)', 'PAYE if hiring', 'confirmation statement within 14 days of first anniversary'],
      generatedAt: new Date().toISOString(),
    };
  },

  async generateDocs(ctx, entity) {
    ctx.log(`uk · docs ${entity.slug}`);
    return {
      bundleId: `b_${Date.now()}`,
      entityId: entity.entityId,
      workspacePath: `./entities/${entity.slug}`,
      artifacts: [
        { kind: 'entity-metadata', relativePath: 'entity.json', format: 'json' },
        { kind: 'plan', relativePath: 'plan.md', format: 'md' },
        { kind: 'checklist', relativePath: 'checklist.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/IN01.md', format: 'md' },
        { kind: 'filing-packet', relativePath: 'filing-packet/articles.md', format: 'md' },
        { kind: 'audit-log', relativePath: 'audit-log.jsonl', format: 'jsonl' },
      ],
      missingInputs: [],
      generatedAt: new Date().toISOString(),
    };
  },

  async submitOrHandoff(ctx, entity, _bundle, mode) {
    ctx.log(`uk · handoff ${entity.slug} mode=${mode}`);
    if (ctx.dryRun) return { handoffId: 'dry-run', entityId: entity.entityId, mode, nextAction: 'dry-run' };
    return { handoffId: `h_${Date.now()}`, entityId: entity.entityId, mode, nextAction: 'submit via Companies House WebFiling or presenter software' };
  },

  async createComplianceTasks(ctx, entity) {
    ctx.log(`uk · compliance ${entity.slug}`);
    return [
      { taskId: `t_${Date.now()}_1`, entityId: entity.entityId, taskType: 'confirmation-statement', title: 'Companies House confirmation statement', description: 'Annual — due within 14 days of the anniversary of incorporation.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 21 },
      { taskId: `t_${Date.now()}_2`, entityId: entity.entityId, taskType: 'annual-accounts', title: 'Companies House annual accounts', description: 'Due 9 months after accounting reference date (21 months for first accounts).', status: 'open', recurrence: 'yearly', reminderDaysBefore: 45 },
      { taskId: `t_${Date.now()}_3`, entityId: entity.entityId, taskType: 'corp-tax', title: 'HMRC Corporation Tax return (CT600)', description: 'Due 12 months after end of accounting period; payment due 9 months + 1 day.', status: 'open', recurrence: 'yearly', reminderDaysBefore: 60 },
    ];
  },

  async syncStatus(ctx, entity) {
    ctx.log(`uk · status ${entity.slug}`);
    // TODO: GET api.company-information.service.gov.uk/company/{number}
    return { status: entity.status };
  },
});
