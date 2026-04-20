# PRD: entityctl — Entity Ops CLI sub-feature for sh1pt

**Status:** Draft v3.1
**Parent product:** sh1pt
**Owner:** Profullstack
**Date:** 2026-04-20

> **Update 2026-04-20:** `entityctl` is folded under the **`build`** primary verb rather than top-level.
> All commands in this PRD read as `sh1pt build entity <...>` instead of `sh1pt entity <...>`.
> Rationale: the entity (certificate, bylaws, filing packet, checklist) is an artifact the CLI produces — that's `build` territory.

## 1. Summary

`entityctl` is a **sub-feature of sh1pt**, exposed under the `build` verb as `sh1pt build entity <...>`.

Within sh1pt, it provides a CLI-first entity operations module for founders, startup studios, and small legal/ops teams that need to:

- decide where to form a company
- compare jurisdiction support levels
- create formation plans without filing anything yet
- check names where supported
- generate formation and governance docs
- hand off filings through direct, assisted, packet-only, or provider flows
- track compliance after formation
- manage spinouts from a parent studio

The feature is **English-first** and **pack-based**. Every jurisdiction is implemented as a pack with an explicit support level:

- **Full**
- **Assisted**
- **Read/Compliance**
- **Stub**
- **Experimental**

This feature does **not** pretend government formation is universally API-native. It automates what is safe, guides what is manual, and logs everything.

---

## 2. Why this belongs inside sh1pt

sh1pt is intended to support founders and operators building, launching, and structuring new ventures.

Entity formation and compliance are adjacent to the core workflow of launching a new company or spinout. Instead of building a separate standalone product first, `entityctl` should live under sh1pt as a product area/module that can later be split into its own package or service if needed.

### Strategic fit

This sub-feature helps sh1pt become more than a company-creation idea board. It becomes an operational launch system.

### Benefits of shipping it inside sh1pt

- leverages the existing sh1pt CLI and product surface
- keeps formation/compliance tied to startup creation workflows
- supports parent-company and spinout workflows naturally
- creates a path to future monetization for formation/compliance assistance
- avoids premature product fragmentation

---

## 3. Problem

Entity formation and maintenance are fragmented across:

- registry search tools
- filing portals
- PDF or form-heavy processes
- tax and ID workflows
- compliance calendars
- ad hoc founder memory
- inconsistent legal templates

This gets worse for a startup studio model, where one parent company may incubate several projects and later spin out only the winners.

Today, founders face these problems:

1. they do not know which jurisdiction is actually practical to launch in
2. they lose time switching between search tools, templates, and filing portals
3. they create inconsistent entity docs across projects
4. they forget post-formation tasks and annual filings
5. they cannot clearly track what is planned, generated, submitted, or complete
6. they overestimate how much can really be automated

---

## 4. Vision

A founder using sh1pt should be able to run one command or use one workflow to start a new entity plan, see a clear path to launch, generate the right docs, hand off the filing appropriately, and keep the entity compliant afterward.

The experience should feel like software, even when the underlying legal workflow still includes humans.

---

## 5. Goals

### Business goals

- make entity ops repeatable for studios and founders inside sh1pt
- reduce messy early legal structure decisions
- standardize docs and workflows across spinouts
- create a system of record for entity actions
- expand internationally through modular jurisdiction packs

### User goals

- know the next step at every stage
- compare jurisdictions without doing manual research each time
- generate usable docs fast
- avoid missed compliance deadlines
- preserve a clear audit trail
- support multiple future spinouts without reinventing the workflow

### Product goals

- ship a strong CLI-first sub-feature within sh1pt
- support a mix of direct and assisted filing modes
- make support levels explicit and honest
- allow every unsupported jurisdiction to exist as a stub from day 1

---

## 6. Non-goals

The following are out of scope for v1:

- replacing legal counsel
- giving legal advice
- giving tax advice
- full cap-table management
- payroll
- bookkeeping
- token issuance
- securities compliance
- DAO-native governance tooling
- non-English-first global coverage
- pretending every jurisdiction can be fully automated

---

## 7. Users

### Primary user

Founder or operator running a startup studio, holding company, or new venture inside the sh1pt ecosystem.

### Secondary users

- ops/admin person responsible for filings
- outside startup counsel reviewing docs
- accountant/CPA reviewing tax setup and basic entity metadata
- internal team member responsible for compliance tracking

---

## 8. Product principles

1. **No fake automation**
   If a human step is required, the product must say so clearly.

2. **Pack-based architecture**
   Every jurisdiction must be isolated behind a consistent interface.

3. **Support levels are explicit**
   Users must always know whether a jurisdiction is Full, Assisted, Read/Compliance, Stub, or Experimental.

4. **Studio-first model**
   Parent entities, projects, and spinouts are first-class concepts.

5. **Audit everything**
   Every meaningful action must create a durable event.

6. **Local-first friendly**
   The CLI should work well with local files and optional hosted sync later.

7. **Ship the boring stuff first**
   Corporations and LLC workflows come before niche structures.

---

## 9. Jurisdiction strategy

We will support **English-first jurisdictions** with relatively developer-friendly registry surfaces first. Everything else can exist as a stub pack until promoted.

### Support levels

#### Full
Supports:

- name search/check
- formation planning
- doc generation
- filing handoff or supported submission
- post-formation task generation
- compliance tracking
- status sync where feasible

#### Assisted
Supports:

- name search/check
- doc generation
- structured filing payloads
- guided filing handoff
- compliance tracking

#### Read/Compliance
Supports:

- entity lookup/status sync
- annual deadlines
- compliance tasks
- human filing checklists
- artifact storage

#### Stub
Supports:

- schema
- pack placeholder
- manual checklists
- basic templates
- future adapter hooks

#### Experimental
Supports:

- limited early workflows behind a feature flag
- no production promises
- narrow use cases only

---

## 10. Initial jurisdiction plan

### Full support at launch

- United States
- New Zealand

### Assisted support at launch

- United Kingdom
- Hong Kong
- Australia

### Read/Compliance support at launch

- Canada
- Ireland
- Singapore

### Experimental at launch

- Wyoming DAO LLC wrapper

### Stub at launch

Every other requested English-first jurisdiction starts as a **Stub** pack on day 1.

Examples include:

- India
- South Africa
- Nigeria
- Kenya
- Pakistan
- Jamaica
- Barbados
- Trinidad and Tobago
- Malaysia
- Botswana
- Ghana
- Uganda
- Tanzania
- Zambia
- Zimbabwe
- Fiji

The product promise is not that these are fully supported immediately. The promise is that the pack exists, the entity can be modeled, docs/checklists can be stubbed, and the jurisdiction can later be promoted.

---

## 11. Why DAO is not core

DAO support is **not** the alternative to country support.

DAO support is a niche wrapper workflow. It should remain:

- experimental
- U.S.-specific at first
- limited to legal-wrapper setup only
- explicitly separate from token or securities workflows

For v1, DAO means:

- create a Wyoming DAO LLC template
- generate a checklist
- generate filing packet stubs
- track annual maintenance tasks

It does **not** mean:

- token issuance
- on-chain governance tooling
- securities analysis
- treasury management
- DAO-native cap table replacement

---

## 12. Scope

## In scope for MVP

1. pack registry
2. entity workspace
3. project-to-spinout workflow
4. name check adapters where supported
5. formation plan generation
6. document generation
7. filing handoff modes
8. compliance task engine
9. artifact storage
10. audit log
11. U.S. EIN preflight checklist
12. stub pack scaffolding

## Out of scope for MVP

- direct IRS automation
- full registered agent marketplace
- beneficial ownership reporting automation
- stock issuance workflow
- board management portal
- public fundraising flows
- advanced tax elections beyond checklist support
- non-English jurisdiction prioritization

---

## 13. Core user flows

### Flow A: spin out a winning project

1. user creates a project under a parent company
2. user compares jurisdictions
3. user selects a pack and entity type
4. system runs name search or creates name-check task
5. system generates a formation plan
6. system generates docs and filing packet
7. system hands off filing via selected mode
8. user marks submission status
9. system creates post-formation and recurring compliance tasks

### Flow B: create a new standalone entity

1. user initializes an entity directly
2. user selects jurisdiction and support mode
3. system generates plan and docs
4. system guides the filing path
5. system tracks status and deadlines

### Flow C: manage an existing entity

1. user imports or manually creates entity metadata
2. system attaches jurisdiction pack
3. system creates compliance schedule
4. user uploads filings and notes over time
5. system maintains status and audit trail

### Flow D: model an unsupported jurisdiction

1. user creates entity with a stub pack
2. system stores core metadata
3. system generates manual checklist
4. system creates artifact folder and audit trail
5. user can later promote the entity to a better-supported pack if available

---

## 14. MVP definition

The MVP is successful if a founder can:

- initialize a new entity or spinout from the CLI
- compare at least two jurisdictions
- see a clear support level for each
- generate a formation plan
- generate a document/checklist bundle
- choose a filing handoff mode
- store artifacts and notes
- track recurring compliance deadlines
- review an audit log of what happened

---

## 15. Functional requirements

### FR1 — Jurisdiction pack registry

The system must maintain a registry of packs with:

- pack ID
- jurisdiction code
- support level
- supported entity types
- filing modes supported
- required manual steps
- required artifacts
- compliance rules
- experimental flag
- version

### FR2 — Entity workspace

The system must create a workspace for each entity containing:

- legal name
- short name
- project slug
- jurisdiction
- entity type
- support level
- parent entity reference
- responsible contact
- status
- formation mode
- artifacts
- notes
- compliance tasks
- audit history

### FR3 — Project and spinout model

The system must support:

- parent entity
- project
- candidate spinout
- launched spinout

The system must preserve relationships between them.

### FR4 — Name search

The system must:

- support official or assisted name search where possible
- store name candidates
- store evidence and timestamps
- mark names as clear, conflict-risk, or manual review required

### FR5 — Formation planning

The system must generate a plan containing:

- selected jurisdiction
- selected entity type
- support level
- required inputs
- required manual steps
- filing path recommendation
- post-formation tasks
- unresolved blockers

### FR6 — Document generation

The system must generate:

- structured JSON metadata
- a markdown checklist
- a filing packet directory
- internal governance docs from templates
- issue list for missing inputs

### FR7 — Filing handoff modes

The system must support these modes:

- `direct`
- `assisted`
- `packet-only`
- `provider`
- `stub`

Each entity must record which mode is being used.

### FR8 — Compliance engine

The system must:

- create recurring tasks by pack
- support due dates and reminders
- mark tasks as open, blocked, submitted, complete, or overdue
- attach files and notes to each task
- show current compliance status at the entity level

### FR9 — Audit log

The system must create immutable events for:

- entity initialized
- pack selected
- name check run
- plan generated
- docs generated
- packet exported
- filing handed off
- status changed
- artifact uploaded
- task completed
- reminder dismissed

### FR10 — Stub pack scaffolding

The system must support auto-generating a stub pack with:

- metadata
- checklist placeholder
- artifact folder
- minimal pack schema
- future upgrade path

### FR11 — Experimental DAO wrapper

The system must support:

- Wyoming DAO LLC as an experimental pack
- manual checklist generation
- artifact tracking
- annual maintenance reminders

It must not support tokenomics or on-chain governance.

---

## 16. CLI UX

### Design principles

- plain-English commands
- every command returns a next step
- no hidden manual requirements
- safe defaults
- machine-readable outputs available for scripting

### Example commands

    sh1pt build entity pack list
    sh1pt build entity pack info us
    sh1pt build entity pack info nz
    sh1pt build entity pack info uk

    sh1pt build entity init sh1pt --parent "Profullstack, Inc." --jurisdiction us-delaware --type c-corp
    sh1pt build entity init kiwi-labs --jurisdiction nz --type company
    sh1pt build entity init uk-holdco --jurisdiction uk --type limited-company

    sh1pt build entity compare --jurisdictions us-delaware,nz,uk,hk
    sh1pt build entity name-check sh1pt --jurisdiction us-california
    sh1pt build entity plan generate sh1pt
    sh1pt build entity docs generate sh1pt
    sh1pt build entity filing handoff sh1pt --mode assisted
    sh1pt build entity compliance enable sh1pt
    sh1pt build entity status sh1pt
    sh1pt build entity audit tail sh1pt

    sh1pt build entity stub init india --entity-type private-company
    sh1pt build entity stub init south-africa --entity-type private-company
    sh1pt build entity experimental init dao-wy --type dao-llc

### Output expectations

Every command should support:

- readable terminal output
- JSON output mode
- non-zero exit code on failure
- pointer to generated artifacts

---

## 17. Artifact outputs

Each entity should get a predictable workspace structure:

    /entities/<slug>/
      entity.json
      plan.md
      checklist.md
      notes.md
      audit-log.jsonl
      /docs/
      /filing-packet/
      /artifacts/
      /compliance/

### Minimum generated artifacts

- entity metadata file
- formation plan
- checklist
- audit log
- docs directory
- filing packet directory

---

## 18. Data model

### Core objects

- `JurisdictionPack`
- `Entity`
- `Project`
- `FormationPlan`
- `DocumentBundle`
- `FilingHandoff`
- `ComplianceTask`
- `AuditEvent`

### Key fields

#### JurisdictionPack
- `pack_id`
- `jurisdiction_code`
- `display_name`
- `support_level`
- `entity_types_supported`
- `filing_modes_supported`
- `experimental`
- `version`

#### Entity
- `entity_id`
- `slug`
- `legal_name`
- `jurisdiction`
- `entity_type`
- `support_level`
- `parent_entity_id`
- `status`
- `formation_mode`

#### FormationPlan
- `plan_id`
- `entity_id`
- `selected_pack_id`
- `required_inputs`
- `manual_steps`
- `recommended_mode`
- `blockers`

#### ComplianceTask
- `task_id`
- `entity_id`
- `task_type`
- `due_date`
- `status`
- `owner`
- `attachments`

#### AuditEvent
- `event_id`
- `entity_id`
- `event_type`
- `timestamp`
- `actor`
- `payload`

---

## 19. Pack SDK contract

Every jurisdiction pack must implement the same contract.

### Required methods

- `describe()`
- `validate_entity_type()`
- `search_name()`
- `generate_plan()`
- `generate_docs()`
- `submit_or_handoff()`
- `create_compliance_tasks()`
- `sync_status()`

### Required metadata

- support level
- supported entity types
- filing modes
- required manual steps
- required inputs
- compliance rules
- artifact expectations
- experimental flag

### Stub pack behavior

A stub pack may return:

- no live search support
- no direct filing support
- checklist-only formation plan
- manual compliance placeholders

That is acceptable as long as the system remains explicit.

---

## 20. Filing modes

### Direct
Use only when the pack supports safe direct submission.

### Assisted
Generate payloads and guide the user through a supported filing flow.

### Packet-only
Generate everything needed for a human or counsel to file manually.

### Provider
Hand off to an external filing provider.

### Stub
No submission. Checklists and artifacts only.

---

## 21. Security and privacy

The feature must:

- avoid storing SSNs or similar personal identifiers by default
- redact secrets from terminal output
- support local secret storage for API keys
- support a local-only mode
- separate public entity metadata from sensitive user inputs
- log access to sensitive artifacts where possible

---

## 22. Success metrics

### Primary metrics

- median time from `init` to `packet ready`
- percentage of entities with completed formation plan
- percentage of compliance tasks completed on time
- percentage of entities with complete audit trails

### Secondary metrics

- number of spinouts created per parent entity
- usage by support level
- number of stub packs created
- rate of stub pack promotion to higher support levels
- average number of manual blockers per formation

---

## 23. Rollout plan

### Phase 1
Ship core platform with:

- pack registry
- entity workspace
- document generation
- filing handoff modes
- compliance engine
- audit log
- U.S. Full pack
- New Zealand Full pack
- stub scaffolding

### Phase 2
Add Assisted packs:

- United Kingdom
- Hong Kong
- Australia

### Phase 3
Add Read/Compliance packs:

- Canada
- Ireland
- Singapore

### Phase 4
Expand stub coverage and promote selected packs based on demand.

### Phase 5
Improve provider integrations and optional hosted collaboration features.

---

## 24. Risks

### Risk: government workflow changes
Mitigation: versioned pack adapters and manual fallback.

### Risk: user assumes generated docs mean filing is complete
Mitigation: explicit lifecycle states.

### Risk: international scope explodes
Mitigation: support-level gating and stub-first policy.

### Risk: DAO work distracts from core roadmap
Mitigation: keep DAO experimental and narrow.

### Risk: inconsistent pack quality
Mitigation: strict SDK contract and acceptance checklist per pack.

---

## 25. Lifecycle states

Each entity must clearly show one of these states:

- `draft`
- `planned`
- `packet-ready`
- `handed-off`
- `submitted`
- `filed`
- `active`
- `needs-review`
- `overdue`

---

## 26. Acceptance criteria for MVP

The MVP is complete when:

1. a user can initialize an entity from the CLI
2. a user can compare packs and support levels
3. a user can generate a formation plan
4. a user can generate artifacts into a predictable folder structure
5. a user can choose a filing mode
6. a user can enable compliance tracking
7. a user can read an audit log
8. a user can create a stub pack for an unsupported jurisdiction
9. a user can model a parent company and at least one spinout
10. the Wyoming DAO LLC pack exists behind an experimental flag

---

## 27. Open questions

- Should the feature stay local-first in v1, or support optional hosted sync immediately?
- Which provider integrations matter first for filing handoff?
- Which stub jurisdictions should be promoted first based on user demand?
- Should pack comparison include estimated manual effort scores?
- Should sh1pt support a simple HTTP API in v1, or keep this feature CLI-only at launch?

---

## 28. Final product decision

Inside sh1pt, `entityctl` will launch as an **English-first global entity ops sub-feature** nested under the `build` verb with:

- **Full:** United States, New Zealand
- **Assisted:** United Kingdom, Hong Kong, Australia
- **Read/Compliance:** Canada, Ireland, Singapore
- **Experimental:** Wyoming DAO LLC
- **Stub:** every other requested English-first jurisdiction

This gives sh1pt a feature that feels global, ships honestly, supports future spinouts, and does not depend on pretending every country has a clean formation API.

---

## Appendix A — Cross-cutting `--from <input>` capability

Separate from entityctl, all four primary verbs accept `--from <input>` to jump into a workflow against an existing project:

- `sh1pt build --from <git-url-or-path>` — clone/detect and compile
- `sh1pt promote --from <live-url-or-repo>` — use site metadata / README to launch campaigns on an existing project
- `sh1pt scale --from <live-url>` — probe infra + propose scaling
- `sh1pt iterate --from <url-or-repo>` — begin the observe → agent-propose → ship loop against an existing asset

Input kinds detected by the shared resolver (`packages/cli/src/input.ts`):

- `git` — `github.com/...`, `gitlab.com/...`, `*.git`, `git@...`, `ssh://...`
- `url` — `http://...`, `https://...`
- `path` — local directories (existing or not)
- `doc` — `.md`, `.pdf`, `.json`, `.yml`, `.yaml` manifests

The resolver does not fetch anything by default; it only classifies the input so each verb's action can fetch or probe as it needs to.
