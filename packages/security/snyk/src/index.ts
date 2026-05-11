import {
  defineSecurityProvider,
  exec,
  manualSetup,
  type SecurityFinding,
  type SecurityScanRequest,
} from '@profullstack/sh1pt-core';

interface Config {
  org?: string;
}

export default defineSecurityProvider<Config>({
  id: 'security-snyk',
  label: 'Snyk',
  cli: 'snyk',
  async connect(ctx, config) {
    if (!ctx.secret('SNYK_TOKEN')) throw new Error('SNYK_TOKEN not in vault — run: sh1pt secret set SNYK_TOKEN <token>');
    ctx.log(`snyk auth <token> · org=${config.org ?? 'default'}`);
    return { accountId: config.org ?? 'snyk' };
  },
  async scan(ctx, req, config) {
    const token = ctx.secret('SNYK_TOKEN');
    if (!token) throw new Error('SNYK_TOKEN not in vault — run: sh1pt secret set SNYK_TOKEN <token>');

    const args = snykArgs(req, config);
    ctx.log(`snyk ${args.join(' ')}`);
    const result = await exec('snyk', args, {
      log: ctx.log,
      env: { SNYK_TOKEN: token },
      throwOnNonZero: false,
    });
    if (result.exitCode > 1 && !result.stdout.trim()) {
      throw new Error(result.stderr.trim() || `snyk failed with exit ${result.exitCode}`);
    }
    return { findings: parseSnykFindings(result.stdout) };
  },
  setup: manualSetup({
    label: 'Snyk CLI',
    vendorDocUrl: 'https://docs.snyk.io/developer-tools/snyk-cli',
    steps: [
      'Install with mise: mise use npm:snyk',
      'Authenticate locally: snyk auth',
      'For CI: sh1pt secret set SNYK_TOKEN <token>',
    ],
  }),
});

function snykArgs(req: SecurityScanRequest, config: Config): string[] {
  const args = req.kind === 'container'
    ? ['container', 'test', req.path]
    : req.kind === 'iac'
      ? ['iac', 'test', req.path]
      : req.kind === 'code'
        ? ['code', 'test', req.path]
        : ['test', req.path];
  if (config.org) args.push(`--org=${config.org}`);
  args.push('--json');
  return args;
}

function parseSnykFindings(stdout: string): SecurityFinding[] {
  if (!stdout.trim()) return [];
  const payload = JSON.parse(stdout) as unknown;
  const reports = Array.isArray(payload) ? payload : [payload];
  return reports.flatMap((report) => {
    if (!isObject(report)) return [];
    const vulnerabilities = arrayProp(report, 'vulnerabilities');
    const iacIssues = arrayProp(report, 'infrastructureAsCodeIssues');
    const codeIssues = arrayProp(report, 'runs')
      .flatMap((run) => isObject(run) ? arrayProp(run, 'results') : []);
    return [
      ...vulnerabilities.map(mapVulnerability),
      ...iacIssues.map(mapIacIssue),
      ...codeIssues.map(mapCodeIssue),
    ].filter((finding): finding is SecurityFinding => !!finding);
  });
}

function mapVulnerability(issue: unknown): SecurityFinding | null {
  if (!isObject(issue)) return null;
  return {
    id: stringProp(issue, 'id') ?? stringProp(issue, 'issueId') ?? stringProp(issue, 'title') ?? 'snyk-vulnerability',
    severity: severityProp(issue),
    title: stringProp(issue, 'title') ?? stringProp(issue, 'message') ?? 'Snyk vulnerability',
    packageName: stringProp(issue, 'packageName') ?? stringProp(issue, 'name'),
    path: stringProp(issue, 'file') ?? formatPath(issue.from),
  };
}

function mapIacIssue(issue: unknown): SecurityFinding | null {
  if (!isObject(issue)) return null;
  return {
    id: stringProp(issue, 'id') ?? stringProp(issue, 'publicId') ?? 'snyk-iac',
    severity: severityProp(issue),
    title: stringProp(issue, 'title') ?? stringProp(issue, 'msg') ?? 'Snyk IaC issue',
    path: stringProp(issue, 'path') ?? stringProp(issue, 'filePath'),
  };
}

function mapCodeIssue(issue: unknown): SecurityFinding | null {
  if (!isObject(issue)) return null;
  const rule = isObject(issue.rule) ? issue.rule : {};
  const location = arrayProp(issue, 'locations')[0];
  const physical = isObject(location) && isObject(location.physicalLocation) ? location.physicalLocation : {};
  const artifact = isObject(physical.artifactLocation) ? physical.artifactLocation : {};
  return {
    id: stringProp(rule, 'id') ?? stringProp(issue, 'ruleId') ?? 'snyk-code',
    severity: severityProp(issue),
    title: stringProp(issue, 'message') ?? stringProp(rule, 'name') ?? 'Snyk Code issue',
    path: stringProp(artifact, 'uri'),
  };
}

function severityProp(issue: Record<string, unknown>): SecurityFinding['severity'] {
  const severity = stringProp(issue, 'severity')?.toLowerCase();
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') return severity;
  return 'low';
}

function arrayProp(obj: Record<string, unknown>, key: string): unknown[] {
  const value = obj[key];
  return Array.isArray(value) ? value : [];
}

function stringProp(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value ? value : undefined;
}

function formatPath(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(String).join(' > ') : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}
