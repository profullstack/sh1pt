import { describe, it, expect } from 'vitest';
import type {
  JurisdictionPack,
  Entity,
  FormationPlan,
  EntityType,
} from '../jurisdiction.js';

export interface JurisdictionContractOptions {
  sampleConfig: unknown;
  sampleEntityType: EntityType;
  sampleName: string;
}

// One runner, run against every entity-* pack. Stub packs are explicitly
// allowed to return unknown/empty results — the contract only requires
// shape conformance, not live registry access.
export function contractTestJurisdiction(
  p: JurisdictionPack<any>,
  opts: JurisdictionContractOptions,
): void {
  describe(`JurisdictionPack contract · ${p.id}`, () => {
    it('declares required fields', () => {
      expect(p.id).toMatch(/^entity-[a-z][a-z0-9-]*$/);
      expect(p.label).toBeTruthy();
    });

    it('describe() returns required metadata', () => {
      const d = p.describe();
      expect(d.packId).toBe(p.id);
      expect(d.jurisdictionCode).toBeTruthy();
      expect(d.displayName).toBeTruthy();
      expect(['full', 'assisted', 'read-compliance', 'stub', 'experimental']).toContain(d.supportLevel);
      expect(Array.isArray(d.entityTypesSupported)).toBe(true);
      expect(d.entityTypesSupported.length).toBeGreaterThan(0);
      expect(Array.isArray(d.filingModesSupported)).toBe(true);
      expect(d.filingModesSupported.length).toBeGreaterThan(0);
      expect(typeof d.version).toBe('string');
    });

    it('validateEntityType() answers for the sample type', () => {
      const result = p.validateEntityType(opts.sampleEntityType);
      expect(typeof result.ok).toBe('boolean');
    });

    it('searchName() dry-run returns a NameCandidate', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const candidate = await p.searchName(ctx as any, opts.sampleName, opts.sampleConfig);
      expect(candidate.name).toBe(opts.sampleName);
      expect(candidate.normalized).toBeTruthy();
      expect(['clear', 'conflict', 'manual', 'unknown']).toContain(candidate.availability);
      expect(candidate.checkedAt).toBeTruthy();
    });

    it('generatePlan() dry-run returns a FormationPlan', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const entity = sampleEntity(p.id, opts.sampleEntityType);
      const plan = await p.generatePlan(ctx as any, entity, opts.sampleConfig);
      expect(plan.planId).toBeTruthy();
      expect(plan.entityId).toBe(entity.entityId);
      expect(plan.selectedPackId).toBe(p.id);
      expect(Array.isArray(plan.requiredInputs)).toBe(true);
      expect(Array.isArray(plan.manualSteps)).toBe(true);
      expect(Array.isArray(plan.blockers)).toBe(true);
      expect(Array.isArray(plan.postFormationTasks)).toBe(true);
    });

    it('generateDocs() dry-run returns a DocumentBundle with artifacts', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const entity = sampleEntity(p.id, opts.sampleEntityType);
      const plan = await p.generatePlan(ctx as any, entity, opts.sampleConfig);
      const bundle = await p.generateDocs(ctx as any, entity, plan, opts.sampleConfig);
      expect(bundle.bundleId).toBeTruthy();
      expect(bundle.workspacePath).toContain(entity.slug);
      expect(Array.isArray(bundle.artifacts)).toBe(true);
      expect(bundle.artifacts.length).toBeGreaterThan(0);
    });

    it('createComplianceTasks() dry-run returns an array', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const entity = sampleEntity(p.id, opts.sampleEntityType);
      const tasks = await p.createComplianceTasks(ctx as any, entity, opts.sampleConfig);
      expect(Array.isArray(tasks)).toBe(true);
      // Stub packs are allowed zero tasks. Full packs should have >=1 but
      // we don't enforce that here — their own tests cover that detail.
    });

    it('syncStatus() dry-run returns a lifecycle state', async () => {
      const ctx = { secret: () => 'test', log: () => {}, dryRun: true };
      const entity = sampleEntity(p.id, opts.sampleEntityType);
      const result = await p.syncStatus(ctx as any, entity, opts.sampleConfig);
      expect([
        'draft', 'planned', 'packet-ready', 'handed-off',
        'submitted', 'filed', 'active', 'needs-review', 'overdue',
      ]).toContain(result.status);
    });
  });
}

function sampleEntity(packId: string, type: EntityType): Entity {
  const now = new Date().toISOString();
  return {
    entityId: 'e_test',
    slug: 'test-co',
    legalName: 'Test Co, Inc.',
    jurisdiction: packId.replace(/^entity-/, ''),
    entityType: type,
    supportLevel: 'stub',
    status: 'draft',
    formationMode: 'stub',
    createdAt: now,
    updatedAt: now,
  };
}
