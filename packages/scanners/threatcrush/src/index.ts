import { defineSecurityProvider, exec, manualSetup, type SecurityFinding, type SecurityScanRequest } from '@profullstack/sh1pt-core';

/**
 * Starter scanner adapter for ThreatCrush (https://threatcrush.com) — an
 * all-in-one security agent (`@profullstack/threatcrush`, CLI `threatcrush`)
 * that monitors connections, scans codebases for vulnerabilities/secrets/CVEs,
 * and pentests APIs.
 *
 * `connect` verifies the CLI is present; `scan` shells out to
 * `threatcrush scan <path>` and maps each finding.
 *
 * The scan command takes a path and nothing else. Verified against the
 * published bundle (@profullstack/threatcrush 0.2.2):
 *
 *   .command("scan").description("Scan codebase for vulnerabilities and secrets")
 *     .argument("[path]", "Path to scan", ".")
 *
 * In particular there is no `--json`: only `threatcrush harden` accepts it, and
 * passing it to `scan` fails with `error: unknown option '--json'`. So the
 * human-readable output is parsed instead — see {@link parseTextFindings}.
 *
 * {@link extractFindings} still tries JSON first, so if `scan` gains a
 * machine-readable mode the adapter picks it up with no further change. The
 * expected shape is:
 *   { type, target, findings: [{ type, severity, message, location, details }],
 *     severity_summary, summary }
 */
interface Config {
  /** Only keep findings at or above this severity. */
  severityThreshold?: SecurityFinding['severity'];
}

interface Ctx {
  secret(k: string): string | undefined;
  log(m: string, level?: 'info' | 'warn' | 'error'): void;
  env?: Record<string, string | undefined>;
}

type JsonRecord = Record<string, unknown>;

const SEVERITY_RANK: Record<SecurityFinding['severity'], number> = { low: 0, medium: 1, high: 2, critical: 3 };

export default defineSecurityProvider<Config>({
  id: 'scanner-threatcrush',
  label: 'ThreatCrush',
  cli: 'threatcrush',

  async connect(ctx, _config) {
    await runThreatcrush(ctx as Ctx, ['--version'], { throwOnNonZero: true });
    // ThreatCrush scans run locally against the host; no account is required.
    return { accountId: 'threatcrush-local' };
  },

  async scan(ctx, req, config) {
    const args = scanArgs(req);
    ctx.log(`threatcrush ${args.join(' ')}`);
    const result = await runThreatcrush(ctx as Ctx, args, { throwOnNonZero: false });

    // threatcrush exits non-zero when issues are found; only >1 is operational.
    if (result.exitCode > 1) {
      const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`;
      throw new Error(`threatcrush scan failed (${result.exitCode}): ${detail.slice(0, 500)}`);
    }

    const findings = extractFindings(result.stdout, req.path);
    return { findings: filterBySeverity(findings, config.severityThreshold) };
  },

  setup: manualSetup({
    label: 'ThreatCrush scanner',
    vendorDocUrl: 'https://threatcrush.com',
    steps: [
      'Install the CLI: npm i -g @profullstack/threatcrush',
      'Scan a codebase: threatcrush scan ./src',
      'No credentials required for local code scans',
    ],
  }),
});

async function runThreatcrush(ctx: Ctx, args: string[], options: { throwOnNonZero: boolean }) {
  return await exec('threatcrush', args, {
    env: { ...ctx.env },
    log: ctx.log,
    throwOnNonZero: options.throwOnNonZero,
  });
}

function scanArgs(req: SecurityScanRequest): string[] {
  // No flags: `scan` accepts a path only. See the note at the top of this file.
  return ['scan', req.path];
}

function filterBySeverity(findings: SecurityFinding[], threshold?: SecurityFinding['severity']): SecurityFinding[] {
  if (!threshold) return findings;
  const min = SEVERITY_RANK[threshold];
  return findings.filter((f) => SEVERITY_RANK[f.severity] >= min);
}

function parseJson(text: string): JsonRecord | JsonRecord[] {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isRecord(parsed) || Array.isArray(parsed)) return parsed as JsonRecord | JsonRecord[];
  } catch {
    // fall through
  }
  return {};
}

/**
 * Map scanner output to findings.
 *
 * JSON is tried first so a future machine-readable `scan` mode is picked up
 * automatically; today's CLI prints text, which {@link parseTextFindings}
 * handles.
 */
function extractFindings(stdout: string, scanPath: string): SecurityFinding[] {
  const fromJson = dedupe(
    issueObjects(parseJson(stdout))
      .map(findingFromIssue)
      .filter((f): f is SecurityFinding => f !== undefined),
  );
  if (fromJson.length > 0) return fromJson;
  return dedupe(parseTextFindings(stdout, scanPath));
}

function dedupe(findings: SecurityFinding[]): SecurityFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.id}\0${finding.path ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Parse the CLI's human-readable output.
 *
 * Each finding is a multi-line block:
 *
 *      CRITICAL  AWS Access Key
 *       File: secrets/config.env:23
 *       Info: Possible AWS Access Key detected
 *       Code: ****************
 *
 * Severity is printed bare for CRITICAL and bracketed for the rest
 * (`[HIGH]`, `[MEDIUM]`, `[LOW]`). `Code:` is a redacted excerpt rather than a
 * location, so it is skipped — matching it would double-count every finding.
 *
 * Paths are reported relative to the directory the CLI was given, so they are
 * re-joined with `scanPath` to stay resolvable from the caller's cwd.
 */
function parseTextFindings(stdout: string, scanPath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  let severity: SecurityFinding['severity'] | undefined;
  let title: string | undefined;

  for (const raw of stripAnsi(stdout).split('\n')) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    const header = /^\s*\[?(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]?\s{1,}(\S.*?)\s*$/i.exec(line);
    if (header && !/^(File|Info|Code):/.test(trimmed)) {
      severity = severityValue(header[1]);
      title = header[2];
      continue;
    }

    const located = /^\s*File:\s*(\S+?)(?::(\d+))?\s*$/.exec(line);
    const file = located?.[1];
    if (file && severity && title) {
      const lineNumber = located?.[2];
      // Line 0 means a whole-file finding; omit it rather than report ":0".
      const suffix = lineNumber && lineNumber !== '0' ? `:${lineNumber}` : '';
      findings.push({
        id: title,
        severity,
        title,
        packageName: undefined,
        path: `${joinPath(scanPath, file)}${suffix}`,
      });
    }
  }

  return findings;
}

function joinPath(scanPath: string, file: string): string {
  const base = scanPath.replace(/^\.\//, '').replace(/\/+$/, '');
  const rel = file.replace(/^\.\//, '');
  if (!base || base === '.' || rel.startsWith(`${base}/`) || rel.startsWith('/')) return rel;
  return `${base}/${rel}`;
}

function stripAnsi(text: string): string {
  // Anchored on ESC (\u001b). A bare /\[[0-9;]*[A-Za-z]/ would also eat the
  // "[HIGH]" severity labels this parser depends on.
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

function issueObjects(data: JsonRecord | JsonRecord[]): JsonRecord[] {
  const found: JsonRecord[] = [];
  const visit = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) {
      if (key && ['findings', 'issues', 'results', 'vulnerabilities'].includes(key)) {
        found.push(...value.filter(isRecord));
        return;
      }
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;
    for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey);
  };
  visit(data);
  return found;
}

function findingFromIssue(issue: JsonRecord): SecurityFinding | undefined {
  // ThreatCrush findings use `type` as the rule name and `message` as the detail.
  const title = stringValue(issue.type) ?? stringValue(issue.message) ?? stringValue(issue.title);
  const severity = severityValue(issue.severity ?? issue.level);
  if (!title || !severity) return undefined;
  return {
    id: stringValue(issue.id) ?? stringValue(issue.type) ?? title,
    severity,
    title,
    packageName: stringValue(issue.packageName) ?? stringValue(issue.package),
    path: findingPath(issue),
  };
}

function findingPath(issue: JsonRecord): string | undefined {
  const explicit = stringValue(issue.location) ?? stringValue(issue.path) ?? stringValue(issue.file);
  if (explicit) return explicit;
  if (isRecord(issue.details)) {
    const file = stringValue(issue.details.file);
    const line = issue.details.line;
    if (file && (typeof line === 'number' || typeof line === 'string')) return `${file}:${line}`;
    return file;
  }
  return undefined;
}

function severityValue(value: unknown): SecurityFinding['severity'] | undefined {
  const severity = typeof value === 'string' ? value.toLowerCase() : undefined;
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') return severity;
  if (severity === 'error') return 'high';
  if (severity === 'warning' || severity === 'warn') return 'medium';
  if (severity === 'info' || severity === 'note') return 'low';
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
