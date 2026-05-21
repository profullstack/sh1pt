import { defineSecurityProvider, exec, manualSetup, type SecurityFinding, type SecurityScanRequest } from '@profullstack/sh1pt-core';

interface Config {
  org?: string;
  apiBaseUrl?: string;
  severityThreshold?: 'low' | 'medium' | 'high' | 'critical';
  policyPath?: string;
  dockerfilePath?: string;
  failOn?: 'all' | 'upgradable' | 'patchable';
}

interface SnykContext {
  secret(k: string): string | undefined;
  log(m: string, level?: 'info' | 'warn' | 'error'): void;
  env?: Record<string, string | undefined>;
}

interface ExecLikeResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type JsonRecord = Record<string, unknown>;

const TOKEN_SECRET = 'SNYK_TOKEN';

export default defineSecurityProvider<Config>({
  id: 'security-snyk',
  label: 'Snyk',
  cli: 'snyk',

  async connect(ctx, config) {
    const token = requireToken(ctx);
    await runSnyk(ctx, token, config, ['--version'], { throwOnNonZero: true });
    return { accountId: config.org ?? 'snyk' };
  },

  async scan(ctx, req, config) {
    const token = requireToken(ctx);
    const args = scanArgs(req, config);
    ctx.log(`snyk ${args.join(' ')}`);
    const result = await runSnyk(ctx, token, config, args, { throwOnNonZero: false });

    // Snyk exits 1 when a scan completed and found issues. Exit 2/3 are
    // operational failures according to the CLI docs.
    if (result.exitCode > 1) {
      throw new Error(scanFailureMessage(result, token));
    }

    const output = parseJson(result.stdout, 'Snyk scan output');
    return { findings: extractFindings(output) };
  },

  setup: manualSetup({
    label: 'Snyk CLI',
    vendorDocUrl: 'https://docs.snyk.io/developer-tools/snyk-cli',
    steps: [
      'Install with mise: mise use npm:snyk',
      'Create a Snyk token or service account token',
      'Run: sh1pt secret set SNYK_TOKEN <token>',
      'Optional: set org in adapter config to pass --org=<org> during scans',
    ],
  }),
});

function requireToken(ctx: SnykContext): string {
  const token = ctx.secret(TOKEN_SECRET);
  if (!token) throw new Error(`${TOKEN_SECRET} not in vault - run \`sh1pt secret set ${TOKEN_SECRET} <token>\``);
  return token;
}

async function runSnyk(
  ctx: SnykContext,
  token: string,
  config: Config,
  args: string[],
  options: { throwOnNonZero: boolean },
): Promise<ExecLikeResult> {
  return await exec('snyk', args, {
    env: snykEnv(ctx, token, config),
    log: redactLog(ctx.log, token),
    throwOnNonZero: options.throwOnNonZero,
  });
}

function snykEnv(ctx: SnykContext, token: string, config: Config): Record<string, string | undefined> {
  return {
    ...ctx.env,
    SNYK_TOKEN: token,
    SNYK_API: config.apiBaseUrl,
    SNYK_CFG_ORG: config.org,
    SNYK_DISABLE_ANALYTICS: '1',
  };
}

function redactLog(log: SnykContext['log'], token: string): SnykContext['log'] {
  return (message, level) => log(redact(message, token), level);
}

function scanArgs(req: SecurityScanRequest, config: Config): string[] {
  const kind = req.kind ?? 'dependencies';
  const args = commandForKind(kind);

  args.push(req.path);
  args.push('--json');

  if (config.org) args.push(`--org=${config.org}`);
  if (config.severityThreshold) args.push(`--severity-threshold=${config.severityThreshold}`);
  if (config.policyPath) args.push(`--policy-path=${config.policyPath}`);
  if (config.failOn && kind !== 'iac' && kind !== 'code') args.push(`--fail-on=${config.failOn}`);
  if (kind === 'container' && config.dockerfilePath) args.push(`--file=${config.dockerfilePath}`);

  return args;
}

function commandForKind(kind: SecurityScanRequest['kind']): string[] {
  if (kind === 'container') return ['container', 'test'];
  if (kind === 'iac') return ['iac', 'test'];
  if (kind === 'code') return ['code', 'test'];
  return ['test'];
}

function scanFailureMessage(result: ExecLikeResult, token: string): string {
  const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`;
  return `Snyk scan failed (${result.exitCode}): ${redact(detail.slice(0, 500), token)}`;
}

function parseJson(text: string, label: string): JsonRecord | JsonRecord[] {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isRecord(parsed) || Array.isArray(parsed)) return parsed as JsonRecord | JsonRecord[];
    throw new Error(`${label} was not an object or array`);
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('object or array')) throw error;
    throw new Error(`${label} was not valid JSON`);
  }
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
      if (key && ['vulnerabilities', 'infrastructureAsCodeIssues', 'issues', 'results'].includes(key)) {
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
  const id = stringValue(issue.id) ?? stringValue(issue.issueId) ?? stringValue(issue.ruleId) ?? stringValue(issue.publicId);
  const title = stringValue(issue.title) ?? messageText(issue.message) ?? stringValue(issue.name);
  const severity = severityValue(issue.severity ?? issue.level);

  if (!title || !severity) return undefined;

  return {
    id: id ?? title,
    severity,
    title,
    packageName: packageName(issue),
    path: findingPath(issue),
  };
}

function packageName(issue: JsonRecord): string | undefined {
  return stringValue(issue.packageName)
    ?? stringValue(issue.package)
    ?? stringValue(issue.name)
    ?? stringValue(issue.pkgName);
}

function findingPath(issue: JsonRecord): string | undefined {
  const explicit = stringValue(issue.path) ?? stringValue(issue.filePath);
  if (explicit) return explicit;

  const from = issue.from;
  if (Array.isArray(from) && from.length) {
    return from.map((entry) => String(entry)).join(' > ');
  }

  const locations = issue.locations;
  if (Array.isArray(locations) && isRecord(locations[0])) {
    const physical = locations[0].physicalLocation;
    if (isRecord(physical) && isRecord(physical.artifactLocation)) {
      return stringValue(physical.artifactLocation.uri);
    }
  }

  return undefined;
}

function messageText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (isRecord(value)) return stringValue(value.text);
  return undefined;
}

function severityValue(value: unknown): SecurityFinding['severity'] | undefined {
  const severity = typeof value === 'string' ? value.toLowerCase() : undefined;
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') return severity;
  if (severity === 'error') return 'high';
  if (severity === 'warning') return 'medium';
  if (severity === 'note') return 'low';
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redact(text: string, token: string): string {
  return token ? text.split(token).join('<redacted>') : text;
}
