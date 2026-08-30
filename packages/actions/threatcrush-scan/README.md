# threatcrush-scan

Runs [ThreatCrush](https://threatcrush.com) over pull requests: hardcoded
credentials, injection, SSRF, unsafe deserialisation, XXE, and dependency
tampering. Results go to the GitHub Security tab as SARIF and to a PR comment.

```bash
sh1pt actions install threatcrush-scan --repo owner/name --pr
```

## Inputs

| Input | Default | Notes |
| --- | --- | --- |
| `scanPath` | `.` | Path to scan, relative to the repository root. |
| `nodeVersion` | `20` | See *Node 20, deliberately*, below. |
| `threatcrushPackageSpec` | `@profullstack/threatcrush@0.11.5` | npm spec used to install the CLI. Pinned rather than `@latest` so one bad publish cannot break every consumer at once; bump it in a pack release. |
| `threatcrushIntegrity` | *(sha512 of 0.11.5)* | SRI hash of that tarball. The workflow downloads, hashes and compares before installing, and refuses to install on a mismatch. Bump it with the spec — read it from `npm view <spec> dist.integrity`. Empty skips the check. |
| `failOn` | *(empty)* | Comma-separated severities that fail the job, e.g. `critical,high`. Empty is report-only. |
| `uploadSarif` | `true` | Upload to the Security tab. Emits `security-events: write`. |
| `commentOnPr` | `true` | Post the report as a pull request comment. Emits `pull-requests: write`. |

## Least privilege is a property of the file, not a condition inside it

Set `uploadSarif` and `commentOnPr` both to `false` and the rendered workflow
asks for `contents: read` and nothing else. The findings go to the job summary
and the SARIF artifact, neither of which needs a write scope.

The two steps that would use those scopes are **not present** in that render —
not shipped-and-disabled. This is the difference the pack cares about: a
disabled Security-tab upload still asks a maintainer to read an upload, reason
about what it mutates, and take on trust that the condition guarding it is
correct. Dead surface in a security-sensitive file is surface all the same, and
a reviewer counting what they are being asked to trust counts it.

Each scope is emitted by the output that needs it, so the `permissions:` block
cannot drift out of step with what the workflow actually does. It used to be a
single hand-assembled `extraPermissions` string, which made least privilege
something a caller had to remember rather than something the template
guaranteed.

There is a second reason to prefer this shape on a first install, and it is not
about trust: **fork pull requests get a read-only `GITHUB_TOKEN`**. The comment
and the Security-tab upload are the outputs GitHub downgrades, so the richest
reporting is least reliable exactly where an external scan is most useful. The
job summary and the artifact work the same on every pull request.

## Pinned means pinned — including for fixes

The pin protects consumers from a bad publish. It equally withholds a good one:
a repository on this pack does **not** pick up a scanner release until
`threatcrushPackageSpec` and `threatcrushIntegrity` are bumped here and the
fleet re-syncs.

That has already produced the counter-intuitive case. Pack `1.6.0` pinned
`0.11.0`, which predates the false-positive work in `0.11.2` — so a consumer on
the *newer* pack got the *noisier* scanner, while an older install tracking
`@latest` got the fixed one. On qryptchat-web that was the difference between 91
findings and 13, with five spurious HIGHs.

So a scanner release is not finished until this pin moves. Bump both inputs in
the same edit — a hash from a different version fails closed, which is the right
direction to fail but a confusing one to debug:

```bash
npm view @profullstack/threatcrush@<version> dist.integrity
```

## Report-only by default

`failOn` is empty on purpose. A repository with pre-existing findings should
get a report on its first install, not a blocked pull request — a gate that
fires on everything gets switched off within a day, and a gate that is off is
worse than one that was never installed. Tighten it to `critical,high` once the
backlog is triaged.

## The comment is scoped to the pull request; the scan is not

The scan always covers the whole tree, and the Security tab always receives all
of it. A credential three directories away is still committed, and narrowing
what gets *scanned* would be a real loss of coverage.

The **comment** is a different artifact. It is part of a review, and a review is
about the change under review. Reporting the repository's whole standing backlog
on every pull request means an author who touched two files is handed ninety
findings they did not write and cannot action — and the one that is theirs is
somewhere in the middle of it. That is how a scanner teaches a team to scroll
past it.

So the comment leads with findings in the files the pull request changes, and
folds the rest into one `<details>` line with its severity counts. Nothing is
hidden: the fold lists the most serious twenty, and the Security tab has
everything.

The diff comes from `HEAD^1..HEAD`. `refs/pull/N/merge` has the base branch as
its first parent and the pull request head as its second, so that range is
exactly the pull request — no API call, no token, no extra permission. It needs
`fetch-depth: 2`, which is why checkout asks for it.

A conflicted pull request has no merge ref. Checkout then falls back to the head
commit, where `HEAD^1` means "the previous commit on this branch" — a
plausible-looking answer to a different question. The workflow checks that HEAD
really has two parents before trusting the range, and when it does not, it
reports every finding unscoped and says so in the log. Scoping to the wrong set
of files is worse than not scoping.

Within each section, findings are ordered **most severe first**. They used to
print in SARIF order, which is file order, so the 50-row cap was decided by where
a finding sat in the tree: a `high` in the last file scanned could be truncated
away while fifty `note`s from the first file printed in full.

## One output path

The CLI emits SARIF itself. The workflow asks for it and nothing parses
anything:

```
threatcrush scan "$SCAN_PATH" --format sarif --output threatcrush.sarif
```

There used to be a second path — a capability probe on `--format`, and a
235-line Python converter that reconstructed findings by regex from the
terminal output when the probe said no. Both were removed in 1.7.0, because
the premise stopped holding: `threatcrushPackageSpec` pins an exact version
and the install step refuses any other bytes, so which interface the CLI has
is decided by the pack rather than discovered on the runner. The probe could
only ever answer yes.

Removing it is a security change more than a tidying one. The converter read a
*display* format, which is free to change between releases — the failure mode
being a silent undercount that still looks like a completed scan. And every
file a pack writes into somebody else's repository is surface a reviewer has
to read; this pack now installs one workflow and nothing else. That was a
direct ask from a maintainer reviewing the supply chain before merging.

The history is worth keeping, because it is the reason the exit-code handling
below is written the way it is. The published `0.2.2` had no `--format`: the
scan died with `error: unknown option '--format'` and commander exited `1` —
*the same code the CLI uses for findings at or above `failOn`*. Read as a
result, that produced no SARIF, the empty-run fallback supplied one, and the
comment said **0 findings**. A green check on a repository that was never
scanned.

## Exit codes are distinguished

The scan step separates the two ways a scan can end without being clean:

- **`1`** — findings at or above `failOn`. A result. Reported, and the job
  fails if you asked it to.
- **`2`** — the scan itself failed. **Not** a result. The job fails and the
  comment says `NOT RUN`, because an unexamined diff is not a clean one and
  the two are indistinguishable to whoever reads the comment.

A missing or empty `threatcrush.sarif` is treated as `2` regardless of what the
process returned.

The same reasoning drives the *Ensure SARIF exists* step. It writes a valid
empty run only so the upload does not fail on a missing file and bury the real
error; it never converts a failed scan into a clean-looking one.

## Node 20, deliberately

The CLI depends on `better-sqlite3`, a native module. Node 20 is the newest
runtime with reliable prebuilt binaries for it — newer runtimes fall through to
a `node-gyp` source build that fails without a full toolchain. If you raise
`nodeVersion`, verify the install still succeeds before trusting a run.

## Fork pull requests

`pull_request` gives fork PRs a read-only `GITHUB_TOKEN`, so the comment step
403s on fork submissions. It is `continue-on-error`, and the report is in the
job summary and the uploaded artifact regardless.

This pack deliberately does **not** use `pull_request_target` to obtain a
writable token. That event runs with repository secrets in scope, and combined
with a checkout of the PR head it executes untrusted contributor code with
access to those secrets. If comments on fork PRs are required, add a separate
`workflow_run`-triggered job that downloads the artifact and comments — it
never checks out untrusted code.

## Coverage

Scored against [`profullstack/malware-test-prs`][testbed]: **90.32%** true
positive rate at a **0.0%** false positive rate against its `SAFE:` control
group, with zero unattributed findings. See `docs/SCANNING.md` in the
threatcrush repository for the method, the confidence model, and the four
weakness classes that are deliberately not implemented.

Snippets in the report are redacted — the CLI never prints matched credential
material, because CI logs are retained and, on public forks, published.

## What the integrity check does not cover

`threatcrushIntegrity` covers the published CLI tarball and nothing else.
`npm install -g` still resolves that package's own runtime dependencies from
version ranges, so the code the CLI actually loads at runtime is **not** fully
covered by the hash. Raised in review by the SAG maintainers, who verified the
hash matched and then pointed at the gap behind it.

Two ways to close it, neither free:

- **A committed lockfile with `npm ci`.** Complete — it pins integrity for
  every package in the tree. It is also 210 packages and about 2,500 lines of
  `package-lock.json` landing in the consuming repository, which is a large
  diff to put in front of a maintainer who did not ask for it.
- **A bundled artifact** whose tarball contains its runtime. Only partial here:
  the CLI depends on `better-sqlite3`, which is a native module and cannot be
  bundled into a single JavaScript file.

Neither is the default. A repository that wants the first should say so, and
the lockfile can be supplied for it.

[testbed]: https://github.com/profullstack/malware-test-prs
