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
| `threatcrushPackageSpec` | `@profullstack/threatcrush@latest` | npm spec used to install the CLI. |
| `failOn` | *(empty)* | Comma-separated severities that fail the job, e.g. `critical,high`. Empty is report-only. |
| `uploadSarif` | `true` | Upload to the Security tab. |

## Report-only by default

`failOn` is empty on purpose. A repository with pre-existing findings should
get a report on its first install, not a blocked pull request — a gate that
fires on everything gets switched off within a day, and a gate that is off is
worse than one that was never installed. Tighten it to `critical,high` once the
backlog is triaged.

## Two output paths, chosen up front

The workflow checks `threatcrush scan --help` for `--format` **before**
scanning, and picks accordingly:

| CLI | Path |
| --- | --- |
| Has `--format` | Native SARIF. Preferred; nothing is parsed. |
| Older | Runs the text scan and converts it with `.github/scripts/threatcrush-to-sarif.py`. |

The check happens up front because exit codes cannot tell the two failures
apart. The published `0.2.2` has no `--format`: the scan died with
`error: unknown option '--format'` and commander exited `1` — *the same code
the CLI uses for findings at or above `failOn`*. Read as a result, that
produced no SARIF, the empty-run fallback supplied one, and the PR comment
said **0 findings**. A green check on a repository that was never scanned.

The converter **fails closed**: if it cannot recognise the output it exits
non-zero and writes nothing, dumping what it saw. Emitting empty SARIF instead
would report "0 findings", which is indistinguishable from a clean scan.

Three details of the legacy format are load-bearing, and the converter is
tested against real captured output rather than assumption:

- Severity is bare for `CRITICAL`, bracketed for `[HIGH]`/`[MEDIUM]`/`[LOW]`.
  One regex shape misses half the findings.
- `File:` paths are relative to the scan root, not the repository root.
  Unprefixed, every finding resolves to nothing in the consumer's view.
- Whole-file findings report line `:0`; SARIF requires `startLine >= 1`.

**The legacy path is a stopgap, not a destination.** `0.2.2` is a secrets
scanner: it scores 12.9% against the testbed. Once a CLI with `--format` is
published the workflow switches to it automatically and coverage goes to
90.32%.

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

[testbed]: https://github.com/profullstack/malware-test-prs
