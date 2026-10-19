# sh1pt PRD conventions

Numbered release proposals live in `prd/` and follow LogicSRC OpenPRD 0.3.
The historical documents in `docs/prd/` retain their original names and status.
OpenPRD defines the product document; OpenSpec defines its companion repository
change bundle. They are separate formats.

The first numbered release proposal is indexed in [prd/README.md](../prd/README.md).
Its companion is [add-entityctl-formation-simplefin](../openspec/changes/add-entityctl-formation-simplefin/proposal.md).
Both are drafts. Source and schema validation does not implement the workflows,
authorize providers, or qualify a bank.

## Authoring and validation

Allocate the next ID with `logicsrc prd new`, never by replacing an existing
number. Update manifest, filename, references and index together. Keep all ten
OpenPRD 0.3 sections in order. Do not automatically accept or archive drafts.

From the repository root:

```bash
logicsrc prd new 'Short imperative title' --repo profullstack/sh1pt
logicsrc prd index --write
logicsrc prd validate --strict
OPENSPEC_TELEMETRY=0 npm exec --yes --package=@fission-ai/openspec@1.13.0 -- \
  openspec validate add-entityctl-formation-simplefin --strict
node scripts/validate-entityctl-spec.mjs
```

The import used installed LogicSRC CLI 0.3.0 and OpenSpec CLI 1.13.0.
The OpenSpec invocation pins its package without adding an application runtime
dependency. The local checker uses only Node.js built-ins and makes no network
requests. Vendor conformance and local traceability checks complement each other.
Current validation details and limitations are recorded in the change's
[validation report](../openspec/changes/add-entityctl-formation-simplefin/validation.md).

Standards:

- OpenPRD: https://logicsrc.com/openprd
- Front matter: https://github.com/profullstack/logicsrc/blob/master/packages/schemas/schemas/openprd-prd.schema.json
- OpenSpec schema: https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/schema.yaml
