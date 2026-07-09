import { defineSecurityProvider, exec, manualSetup, type SecurityFinding, type SecurityScanRequest } from '@profullstack/sh1pt-core';

/**
 * Starter scanner adapter for ThreatCrush (https://threatcrush.com) — an
 * all-in-one security agent (`@profullstack/threatcrush`, CLI `threatcrush`)
 * that monitors connections, scans codebases for vulnerabilities/secrets/CVEs,
 * and pentests APIs.
 *
 * This adapter wraps `threatcrush scan <path>`, whose structured result
 * (`RunResult`) is shaped like:
 *   { type, target, findings: [{ type, severity, message, location, details }],
 *     severity_summary, summary }
 *
 * It is a starter: `connect` verifies the CLI is present and `scan` shells out
 * to `threatcrush scan <path> --json` and maps each finding. Note that the
 * `threatcrush scan` command currently prints human-readable output; `--json`
 * is the assumed machine-readable mode (today only `threatcrush harden` ships
 * `--json`). Adjust {@link scanArgs} once `scan` exposes JSON output.
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

    const findings = extractFindings(parseJson(result.stdout));
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
  return ['scan', req.path, '--json'];
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

function extractFindings(data: JsonRecord | JsonRecord[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();
  for (const issue of issueObjects(data)) {
    const finding = findingFromIssue(issue);
    if (!finding) continue;
    const key = `${finding.id}\0${finding.path ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(finding);
  }
  return findings;
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
