import { defineSecurityProvider, exec, manualSetup, type SecurityFinding, type SecurityScanRequest } from '@profullstack/sh1pt-core';

/**
 * Starter scanner adapter for vu1nz (https://vu1nz.com) — an open-source
 * autonomous AI security scanner that scans, fuzzes, and exploits web targets
 * and repositories locally (via Ollama, no cloud API keys required).
 *
 * This is a starter: `connect` verifies the CLI is present and `scan` shells
 * out to `vu1nz scan <path> --json` and maps the JSON report into sh1pt
 * findings. Tune {@link scanArgs} and the JSON mapping once the exact report
 * shape for your vu1nz version is pinned.
 */
interface Config {
  /** Scan mode passed through to the vu1nz CLI (e.g. "web", "repo"). */
  mode?: 'web' | 'repo';
  /** Ollama model vu1nz should drive its agent loop with. */
  model?: string;
  /** Minimum severity to keep in the findings list. */
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
  id: 'scanner-vu1nz',
  label: 'vu1nz',
  cli: 'vu1nz',

  async connect(ctx, _config) {
    await runVu1nz(ctx as Ctx, ['--version'], { throwOnNonZero: true });
    // vu1nz runs locally and needs no account; surface a stable id.
    return { accountId: 'vu1nz-local' };
  },

  async scan(ctx, req, config) {
    const args = scanArgs(req, config);
    ctx.log(`vu1nz ${args.join(' ')}`);
    const result = await runVu1nz(ctx as Ctx, args, { throwOnNonZero: false });

    // vu1nz exits non-zero when it finds issues; only treat >1 as operational.
    if (result.exitCode > 1) {
      const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`;
      throw new Error(`vu1nz scan failed (${result.exitCode}): ${detail.slice(0, 500)}`);
    }

    const findings = extractFindings(parseJson(result.stdout));
    return { findings: filterBySeverity(findings, config.severityThreshold) };
  },

  setup: manualSetup({
    label: 'vu1nz scanner',
    vendorDocUrl: 'https://vu1nz.com',
    steps: [
      'Install the vu1nz CLI (see https://vu1nz.com) and Ollama for local AI inference',
      'Optional: sh1pt secret set GITHUB_TOKEN <token> to enable authenticated repo scans',
      'vu1nz runs locally with no cloud API key required',
    ],
  }),
});

async function runVu1nz(ctx: Ctx, args: string[], options: { throwOnNonZero: boolean }) {
  const token = ctx.secret('GITHUB_TOKEN');
  return await exec('vu1nz', args, {
    env: { ...ctx.env, ...(token ? { GITHUB_TOKEN: token } : {}) },
    log: ctx.log,
    throwOnNonZero: options.throwOnNonZero,
  });
}

function scanArgs(req: SecurityScanRequest, config: Config): string[] {
  const args = ['scan', req.path, '--json'];
  if (config.mode) args.push(`--mode=${config.mode}`);
  if (config.model) args.push(`--model=${config.model}`);
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
      if (key && ['findings', 'vulnerabilities', 'issues', 'results'].includes(key)) {
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
  const title = stringValue(issue.title) ?? stringValue(issue.name) ?? stringValue(issue.message);
  const severity = severityValue(issue.severity ?? issue.level);
  if (!title || !severity) return undefined;
  return {
    id: stringValue(issue.id) ?? stringValue(issue.ruleId) ?? title,
    severity,
    title,
    packageName: stringValue(issue.packageName) ?? stringValue(issue.target),
    path: stringValue(issue.path) ?? stringValue(issue.url) ?? stringValue(issue.location),
  };
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
