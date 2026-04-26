// Jurisdiction / entity-ops pack — formation, name checks, doc generation,
// filing handoff, and post-formation compliance for a given jurisdiction +
// entity type. One adapter per pack (entity-us, entity-nz, entity-uk, …).
//
// Every pack declares a support level so the CLI can be honest about how
// much is actually automated vs. manual. Stub packs exist from day 1 so
// any English-first jurisdiction can be modeled, even before real name
// search / filing is wired up.

export type SupportLevel =
  | 'full'               // name check + plan + docs + filing + compliance + status sync
  | 'assisted'           // payloads + guided handoff + compliance
  | 'read-compliance'    // status/deadlines/human checklists only
  | 'stub'               // schema + checklist placeholder; no live calls
  | 'experimental';      // behind a feature flag, narrow use cases only

export type FilingMode =
  | 'direct'             // pack submits the filing programmatically
  | 'assisted'           // pack generates payloads + guides the user
  | 'packet-only'        // pack generates a filing packet for a human/counsel
  | 'provider'           // hand off to an external filing provider
  | 'stub';              // checklist + artifacts only

// PRD §24 — the entity walks through these states; never hidden.
export type EntityLifecycleState =
  | 'draft'
  | 'planned'
  | 'packet-ready'
  | 'handed-off'
  | 'submitted'
  | 'filed'
  | 'active'
  | 'needs-review'
  | 'overdue';

export type EntityType =
  // US / common-law defaults
  | 'c-corp' | 's-corp' | 'llc' | 'benefit-corp' | 'nonprofit'
  // UK / HK / SG / IE variants
  | 'limited-company' | 'plc' | 'llp' | 'sole-trader'
  // NZ / AU variants
  | 'company' | 'private-company' | 'public-company'
  // Experimental DAO wrapper
  | 'dao-llc'
  // Catch-all for stub packs that haven't enumerated their shapes yet
  | 'other';

export interface Entity {
  entityId: string;
  slug: string;                     // 'sh1pt', 'kiwi-labs'
  legalName: string;
  jurisdiction: string;             // pack jurisdiction code, e.g. 'us-delaware', 'nz', 'uk'
  entityType: EntityType;
  supportLevel: SupportLevel;
  parentEntityId?: string;          // studio / holdco reference
  projectSlug?: string;             // originating project inside a studio
  status: EntityLifecycleState;
  formationMode: FilingMode;
  responsibleContact?: string;      // email or name
  createdAt: string;
  updatedAt: string;
}

export interface NameCandidate {
  name: string;
  normalized: string;
  // 'clear'      — registry check found no conflicts
  // 'conflict'   — an exact or confusingly similar registration exists
  // 'manual'     — adapter cannot decide; flagged for human review
  // 'unknown'    — stub/assisted packs with no live lookup
  availability: 'clear' | 'conflict' | 'manual' | 'unknown';
  evidenceUrl?: string;
  checkedAt: string;
  notes?: string;
}

export interface FormationPlan {
  planId: string;
  entityId: string;
  selectedPackId: string;
  selectedEntityType: EntityType;
  supportLevel: SupportLevel;
  requiredInputs: string[];         // e.g. 'registered-agent-address', 'director-ids'
  manualSteps: string[];            // things the pack cannot automate
  recommendedMode: FilingMode;
  blockers: string[];               // unresolved items that prevent packet-ready
  postFormationTasks: string[];     // EIN, bank account, registered agent, etc.
  generatedAt: string;
}

export interface DocumentBundle {
  bundleId: string;
  entityId: string;
  // Predictable workspace structure — see PRD §16.
  // /entities/<slug>/ with entity.json, plan.md, checklist.md, docs/, filing-packet/, …
  workspacePath: string;
  artifacts: Array<{
    kind:
      | 'entity-metadata'
      | 'plan'
      | 'checklist'
      | 'filing-packet'
      | 'governance-doc'
      | 'notes'
      | 'audit-log';
    relativePath: string;           // relative to workspacePath
    format: 'json' | 'md' | 'pdf' | 'jsonl' | 'txt' | 'docx';
  }>;
  missingInputs: string[];          // issue list for docs that couldn't generate
  generatedAt: string;
}

export interface FilingHandoff {
  handoffId: string;
  entityId: string;
  mode: FilingMode;
  packetPath?: string;              // for packet-only / provider / assisted modes
  externalProvider?: string;        // e.g. 'clerky', 'stripe-atlas', 'firstbase'
  submittedAt?: string;
  trackingRef?: string;             // registry receipt / provider order id
  nextAction: string;               // what the user needs to do next, in English
}

export type ComplianceTaskStatus = 'open' | 'blocked' | 'submitted' | 'complete' | 'overdue';

export interface ComplianceTask {
  taskId: string;
  entityId: string;
  taskType: string;                 // 'annual-report', 'franchise-tax', 'bo-report', …
  title: string;
  description: string;
  dueDate?: string;                 // ISO date; omitted for one-shot / just-in-time tasks
  status: ComplianceTaskStatus;
  owner?: string;
  attachments?: string[];
  recurrence?: 'once' | 'yearly' | 'quarterly' | 'monthly';
  reminderDaysBefore?: number;
}

export type AuditEventType =
  | 'entity.initialized'
  | 'pack.selected'
  | 'name.checked'
  | 'plan.generated'
  | 'docs.generated'
  | 'packet.exported'
  | 'filing.handed-off'
  | 'status.changed'
  | 'artifact.uploaded'
  | 'task.completed'
  | 'reminder.dismissed';

export interface AuditEvent {
  eventId: string;
  entityId: string;
  eventType: AuditEventType;
  timestamp: string;
  actor: string;                    // cli user, service account, agent id
  payload: Record<string, unknown>;
}

// ctx is the same shape every sh1pt adapter gets — secrets from the vault
// (never .env), a log sink, a dry-run guard, and an optional cancellation
// signal for long-running operations (status polls, browser-mode flows).
export interface JurisdictionCtx {
  secret(k: string): string | undefined;
  log(m: string): void;
  dryRun: boolean;
  signal?: AbortSignal;
}

export interface JurisdictionDescribe {
  packId: string;
  jurisdictionCode: string;         // 'us-delaware', 'nz', 'uk', 'hk', 'au', …
  displayName: string;
  supportLevel: SupportLevel;
  entityTypesSupported: EntityType[];
  filingModesSupported: FilingMode[];
  experimental: boolean;
  version: string;                  // pack version — bumped when registry shape changes
  requiredManualSteps: string[];
  requiredInputs: string[];
  artifactExpectations: string[];
}

export interface JurisdictionPack<Config = unknown> {
  id: string;                       // 'entity-us', 'entity-nz', 'entity-dao-wy', …
  label: string;

  describe(): JurisdictionDescribe;

  validateEntityType(type: EntityType): { ok: boolean; reason?: string };

  searchName(
    ctx: JurisdictionCtx,
    name: string,
    config: Config,
  ): Promise<NameCandidate>;

  generatePlan(
    ctx: JurisdictionCtx,
    entity: Entity,
    config: Config,
  ): Promise<FormationPlan>;

  generateDocs(
    ctx: JurisdictionCtx,
    entity: Entity,
    plan: FormationPlan,
    config: Config,
  ): Promise<DocumentBundle>;

  submitOrHandoff(
    ctx: JurisdictionCtx,
    entity: Entity,
    bundle: DocumentBundle,
    mode: FilingMode,
    config: Config,
  ): Promise<FilingHandoff>;

  createComplianceTasks(
    ctx: JurisdictionCtx,
    entity: Entity,
    config: Config,
  ): Promise<ComplianceTask[]>;

  syncStatus(
    ctx: JurisdictionCtx,
    entity: Entity,
    config: Config,
  ): Promise<{ status: EntityLifecycleState; notes?: string }>;

  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineJurisdiction<Config>(p: JurisdictionPack<Config>): JurisdictionPack<Config> {
  return p;
}

const jurisdictionRegistry = new Map<string, JurisdictionPack<any>>();

export function registerJurisdiction(p: JurisdictionPack<any>): void {
  if (jurisdictionRegistry.has(p.id)) throw new Error(`Jurisdiction pack already registered: ${p.id}`);
  jurisdictionRegistry.set(p.id, p);
}

export function getJurisdiction(id: string): JurisdictionPack<any> | undefined {
  return jurisdictionRegistry.get(id);
}

export function listJurisdictions(): JurisdictionPack<any>[] {
  return [...jurisdictionRegistry.values()];
}
