import { defineSecurityProvider, exec, manualSetup, type SecurityFinding, type SecurityScanRequest } from '@profullstack/sh1pt-core';

/**
 * Starter scanner adapter for verification-layer
 * (https://www.npmjs.com/package/verification-layer) — an open-source HIPAA
 * compliance scanner for healthcare code. Ships the `vlayer` CLI with 131
 * rules across 5 HIPAA categories (PHI, encryption, audit, access control,
 * transmission) and supports baselines + suppression for CI/CD gating.
 *
 * This is a starter: `connect` verifies the CLI is present and `scan` shells
 * out to `vlayer scan <path> --format json` and maps each rule violation into
 * a sh1pt finding. Tune {@link scanArgs} and the JSON mapping once the exact
 * report shape for your vlayer version is pinned.
 */
interface Config {
  /** Path to a baseline file of accepted findings to ignore. */
  baseline?: string;
  /** Only fail at or above this severity. */
  severityThreshold?: SecurityFinding['severity'];
  /** Restrict to a subset of HIPAA rule categories (e.g. "phi", "encryption"). */
  categories?: string[];
}

interface Ctx {
  secret(k: string): string | undefined;
  log(m: string, level?: 'info' | 'warn' | 'error'): void;
  env?: Record<string, string | undefined>;
}

type JsonRecord = Record<string, unknown>;

const SEVERITY_RANK: Record<SecurityFinding['severity'], number> = { low: 0, medium: 1, high: 2, critical: 3 };

export default defineSecurityProvider<Config>({
  id: 'scanner-verification-layer',
  label: 'verification-layer',
  cli: 'vlayer',

  async connect(ctx, _config) {
    await runVlayer(ctx as Ctx, ['--version'], { throwOnNonZero: true });
    // vlayer is a local static analyzer with no account model.
    return { accountId: 'verification-layer-local' };
  },

  async scan(ctx, req, config) {
    const args = scanArgs(req, config);
    ctx.log(`vlayer ${args.join(' ')}`);
    const result = await runVlayer(ctx as Ctx, args, { throwOnNonZero: false });

    // vlayer exits non-zero when violations are found; only >1 is operational.
    if (result.exitCode > 1) {
      const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`;
      throw new Error(`verification-layer scan failed (${result.exitCode}): ${detail.slice(0, 500)}`);
    }

    const findings = extractFindings(parseJson(result.stdout));
    return { findings: filterBySeverity(findings, config.severityThreshold) };
  },

  setup: manualSetup({
    label: 'verification-layer (vlayer) scanner',
    vendorDocUrl: 'https://www.npmjs.com/package/verification-layer',
    steps: [
      'Install with mise: mise use npm:verification-layer (provides the `vlayer` CLI)',
      'Run a scan: vlayer scan <path> --format json',
      'Optional: generate a baseline to suppress accepted findings: vlayer baseline',
      'No credentials required — vlayer is a local static analyzer',
    ],
  }),
});

async function runVlayer(ctx: Ctx, args: string[], options: { throwOnNonZero: boolean }) {
  return await exec('vlayer', args, {
    env: { ...ctx.env },
    log: ctx.log,
    throwOnNonZero: options.throwOnNonZero,
  });
}

function scanArgs(req: SecurityScanRequest, config: Config): string[] {
  const args = ['scan', req.path, '--format', 'json'];
  if (config.baseline) args.push(`--baseline=${config.baseline}`);
  if (config.categories?.length) args.push(`--categories=${config.categories.join(',')}`);
  return args;
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
      if (key && ['violations', 'findings', 'issues', 'results'].includes(key)) {
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
  const title = stringValue(issue.title) ?? stringValue(issue.message) ?? stringValue(issue.rule);
  const severity = severityValue(issue.severity ?? issue.level);
  if (!title || !severity) return undefined;
  return {
    id: stringValue(issue.ruleId) ?? stringValue(issue.id) ?? stringValue(issue.rule) ?? title,
    severity,
    title,
    packageName: stringValue(issue.category),
    path: findingPath(issue),
  };
}

function findingPath(issue: JsonRecord): string | undefined {
  const file = stringValue(issue.file) ?? stringValue(issue.path) ?? stringValue(issue.filePath);
  const line = issue.line;
  if (file && (typeof line === 'number' || typeof line === 'string')) return `${file}:${line}`;
  return file;
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
