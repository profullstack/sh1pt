import { defineSecurityProvider, exec, manualSetup, type SecurityFinding, type SecurityScanRequest } from '@profullstack/sh1pt-core';

interface Config {
  org?: string;
  tokenKey?: string;
}

interface SnykVulnerability {
  id?: string;
  issueId?: string;
  severity?: string;
  title?: string;
  packageName?: string;
  name?: string;
  from?: string[];
  file?: string;
  path?: string;
}

interface SnykJson {
  vulnerabilities?: SnykVulnerability[];
  issues?: {
    vulnerabilities?: SnykVulnerability[];
  };
}

export default defineSecurityProvider<Config>({
  id: 'security-snyk',
  label: 'Snyk',
  cli: 'snyk',
  async connect(ctx, config) {
    const token = requireToken(ctx, config);
    ctx.log(`snyk auth <token> · org=${config.org ?? 'default'}`);
    await runSnyk(ctx, ['auth', token], config);
    await runSnyk(ctx, ['whoami', ...orgArgs(config)], config);
    return { accountId: config.org ?? 'snyk' };
  },
  async scan(ctx, req, config) {
    const token = requireToken(ctx, config);
    const args = scanArgs(req, config);
    ctx.log(`snyk ${args.join(' ')}`);
    const result = await runSnyk(ctx, args, config, false, token);
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

function requireToken(ctx: { secret(k: string): string | undefined }, config: Config): string {
  const tokenKey = config.tokenKey ?? 'SNYK_TOKEN';
  const token = ctx.secret(tokenKey);
  if (!token) throw new Error(`${tokenKey} not in vault`);
  return token;
}

function scanArgs(req: SecurityScanRequest, config: Config): string[] {
  const command = req.kind === 'container'
    ? ['container', 'test', req.path]
    : req.kind === 'iac'
      ? ['iac', 'test', req.path]
      : ['test', req.path];
  return [...command, ...orgArgs(config), '--json'];
}

function orgArgs(config: Config): string[] {
  return config.org ? [`--org=${config.org}`] : [];
}

async function runSnyk(
  ctx: { log(m: string): void },
  args: string[],
  config: Config,
  throwOnNonZero = true,
  token?: string,
) {
  try {
    return await exec('snyk', args, {
      log: ctx.log,
      throwOnNonZero,
      env: {
        SNYK_TOKEN: token ?? process.env.SNYK_TOKEN,
        SNYK_CFG_ORG: config.org,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('command not found: snyk')) {
      throw new Error('security-snyk requires the Snyk CLI on PATH. Install it from https://docs.snyk.io/developer-tools/snyk-cli');
    }
    throw error;
  }
}

function parseSnykFindings(stdout: string): SecurityFinding[] {
  if (!stdout.trim()) return [];
  const data = JSON.parse(stdout) as SnykJson | SnykJson[];
  const reports = Array.isArray(data) ? data : [data];
  return reports.flatMap((report) => [
    ...(report.vulnerabilities ?? []),
    ...(report.issues?.vulnerabilities ?? []),
  ]).map(toFinding);
}

function toFinding(vulnerability: SnykVulnerability): SecurityFinding {
  return {
    id: vulnerability.id ?? vulnerability.issueId ?? 'snyk-unknown',
    severity: normalizeSeverity(vulnerability.severity),
    title: vulnerability.title ?? vulnerability.id ?? 'Snyk finding',
    packageName: vulnerability.packageName ?? vulnerability.name,
    path: vulnerability.path ?? vulnerability.file ?? vulnerability.from?.join(' > '),
  };
}

function normalizeSeverity(severity?: string): SecurityFinding['severity'] {
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') return severity;
  return 'low';
}
