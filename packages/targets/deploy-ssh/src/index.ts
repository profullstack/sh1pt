import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import type { ShipContext, TargetStatus } from '@profullstack/sh1pt-core';
import { run, scriptText, shq } from './ssh.js';

// deploy-ssh: Railway-style deploys to a box you own, over ssh.
//
// sh1pt places the code (a git mirror on the box, from any git host, or an
// rsync of the working tree) into releases/<id>, writes shared/app.env from
// the vault, flips `current`, and runs the repo's bin/install.sh: runtime,
// postgres/redis, systemd unit, nginx + TLS, health check. A repo without one
// gets the generic copy in ../bin/install.sh. Failed activation flips back.

export interface Config {
  host: string;
  user?: string;
  sshPort?: number | string;
  sshKeyPath?: string;
  app: string;
  source?: 'git' | 'rsync';      // default: git when a remote is known, else rsync
  repo?: string;                 // any git URL the box can read; default: local `origin`
  ref?: string;                  // branch, tag or sha; default: local HEAD (must be pushed)
  dir?: string;                  // app root on the box; default: apps/<app> under $HOME
  keepReleases?: number;         // default 5
  env?: string[];                // vault keys written to shared/app.env
  vars?: Record<string, string>; // plain values written to shared/app.env
  // Passed to bin/install.sh; unset means bin/install.conf or its default decides.
  runtime?: 'auto' | 'bun' | 'node' | 'static';
  install?: string;
  build?: string;
  start?: string;
  port?: number;
  healthPath?: string;
  healthTimeout?: number;
  domains?: string[];
  tls?: boolean;
  tlsEmail?: string;
  staticDir?: string;
  spa?: boolean;
  postgres?: boolean | string;
  redis?: boolean;
  maxBody?: string;
}

const ID = 'deploy-ssh';
const fail = (msg: string): never => { throw new Error(`${ID} ${msg}`); };

function text(value: unknown, field: string): string {
  const t = typeof value === 'string' ? value.trim() : '';
  if (!t) fail(`requires ${field}`);
  return t;
}

function matching(value: string, re: RegExp, field: string, what: string): string {
  if (!re.test(value)) fail(`${field} must be ${what}`);
  return value;
}

function intIn(value: unknown, field: string, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) fail(`${field} must be an integer from ${min} to ${max}`);
  return n as number;
}

const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$|^\[?[0-9A-Fa-f:.]+\]?$/;
const NAME = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
const PATHISH = /^[A-Za-z0-9._/~-]+$/;
const DOMAIN = /^(\*\.)?[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validate(raw: Config): Config {
  const c: Config = { ...raw };
  c.host = matching(text(raw.host, 'host'), HOST, 'host', 'a hostname or IP');
  if (raw.user !== undefined) c.user = matching(text(raw.user, 'user'), /^[a-z_][a-z0-9_-]*\$?$/, 'user', 'a unix user name');
  if (raw.sshPort !== undefined) c.sshPort = intIn(raw.sshPort, 'sshPort', 1, 65535);
  if (raw.sshKeyPath !== undefined) c.sshKeyPath = text(raw.sshKeyPath, 'sshKeyPath');
  c.app = matching(text(raw.app, 'app'), NAME, 'app', 'lowercase letters, digits and hyphens');
  if (raw.source !== undefined && raw.source !== 'git' && raw.source !== 'rsync') fail('source must be git or rsync');
  if (raw.repo !== undefined) c.repo = text(raw.repo, 'repo');
  if (raw.ref !== undefined) c.ref = matching(text(raw.ref, 'ref'), /^[A-Za-z0-9._/@-]+$/, 'ref', 'a branch, tag or sha');
  if (raw.dir !== undefined) c.dir = matching(text(raw.dir, 'dir'), PATHISH, 'dir', 'a path without spaces or quotes');
  if (raw.keepReleases !== undefined) c.keepReleases = intIn(raw.keepReleases, 'keepReleases', 1, 100);
  for (const k of raw.env ?? []) matching(k, ENV_KEY, 'env', 'a list of environment variable names');
  for (const k of Object.keys(raw.vars ?? {})) matching(k, ENV_KEY, 'vars', 'keyed by environment variable names');
  if (raw.port !== undefined) c.port = intIn(raw.port, 'port', 1, 65535);
  if (raw.healthTimeout !== undefined) c.healthTimeout = intIn(raw.healthTimeout, 'healthTimeout', 1, 3600);
  if (raw.healthPath !== undefined) matching(raw.healthPath, /^\/\S*$/, 'healthPath', 'a path starting with /');
  for (const d of raw.domains ?? []) matching(d, DOMAIN, 'domains', 'a list of hostnames');
  if (raw.staticDir !== undefined) matching(raw.staticDir, PATHISH, 'staticDir', 'a relative path');
  if (typeof raw.postgres === 'string') matching(raw.postgres, /^[a-z_][a-z0-9_]{0,62}$/, 'postgres', 'true or a database name');
  if (raw.runtime !== undefined && !['auto', 'bun', 'node', 'static'].includes(raw.runtime)) fail('runtime must be auto, bun, node or static');
  return c;
}

/** shared/app.env: KEY='value', which both systemd and a shell read the same way. */
export function renderEnv(config: Config, secret: (k: string) => string | undefined): string | undefined {
  if (!config.env?.length && !config.vars) return undefined;
  const lines: string[] = [];
  const add = (k: string, v: string) => {
    if (/['\n\r]/.test(v)) fail(`value of ${k} contains a quote or newline; store it base64-encoded`);
    lines.push(`${k}='${v}'`);
  };
  for (const [k, v] of Object.entries(config.vars ?? {})) add(k, v);
  const missing: string[] = [];
  for (const k of config.env ?? []) {
    const v = secret(k);
    if (v === undefined) missing.push(k); else add(k, v);
  }
  if (missing.length) fail(`missing secrets ${missing.join(', ')}: sh1pt secret set <KEY> <value>`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/** The variables bin/install.sh reads, only for settings the manifest gives. */
export function installerVars(c: Config): Record<string, string> {
  const v: Record<string, string> = {};
  const set = (k: string, val: string | number | boolean | undefined) => {
    if (val === undefined) return;
    v[k] = typeof val === 'boolean' ? (val ? '1' : '0') : String(val);
  };
  set('RUNTIME', c.runtime);
  set('INSTALL_CMD', c.install);
  set('BUILD_CMD', c.build);
  set('START_CMD', c.start);
  set('PORT', c.port);
  set('HEALTH_PATH', c.healthPath);
  set('HEALTH_TIMEOUT', c.healthTimeout);
  if (c.domains) set('DOMAINS', c.domains.join(' '));
  set('TLS', c.tls);
  set('TLS_EMAIL', c.tlsEmail);
  set('STATIC_DIR', c.staticDir);
  set('SPA', c.spa);
  set('POSTGRES', c.postgres);
  set('REDIS', c.redis);
  set('MAX_BODY', c.maxBody);
  return v;
}

function root(c: Config): string {
  const dir = c.dir ?? `apps/${c.app}`;
  return dir.startsWith('~/') ? dir.slice(2) : dir;
}

function destination(c: Config): string {
  return c.user ? `${c.user}@${c.host}` : c.host;
}

function sshOptions(c: Config): string[] {
  const o = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new'];
  if (c.sshPort !== undefined) o.push('-p', String(c.sshPort));
  if (c.sshKeyPath) o.push('-i', c.sshKeyPath);
  return o;
}

export function remoteScript(vars: Record<string, string>): string {
  const exports = Object.entries(vars).map(([k, v]) => `export ${k}=${shq(v)}`).join('\n');
  return `${exports}\n${scriptText('deploy-remote.sh')}`;
}

async function remote(c: Config, vars: Record<string, string>, log: ShipContext['log']) {
  const res = await run('ssh', [...sshOptions(c), destination(c), 'bash -s'], { log, input: remoteScript(vars) });
  const fields: Record<string, string> = {};
  for (const line of res.stdout.split('\n')) {
    if (!line.startsWith('SH1PT ')) continue;
    for (const m of line.slice(6).matchAll(/([a-z_]+)=(\S*)/g)) fields[m[1]!] = m[2]!;
  }
  return { ...res, fields };
}

async function git(projectDir: string, args: string[]): Promise<string | undefined> {
  const r = await exec('git', ['-C', projectDir, ...args], { log: () => {}, throwOnNonZero: false });
  return r.exitCode === 0 ? r.stdout.trim() : undefined;
}

export function releaseId(sha: string | undefined, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${stamp}-${sha ? sha.slice(0, 7) : 'local'}`;
}

function baseVars(c: Config, action: string): Record<string, string> {
  return { ACTION: action, APP: c.app, ROOT: root(c), KEEP: String(c.keepReleases ?? 5), ...installerVars(c) };
}

const quiet = (msg: string, level?: string) => {
  if (level === 'warn' || level === 'error') console.error(msg); else console.log(msg);
};

export default defineTarget<Config>({
  id: ID,
  kind: 'web',
  label: 'Your server (ssh + systemd + nginx)',
  validate: (config) => validate(config as Config),

  async build(ctx, config) {
    const c = validate(config);
    ctx.log(`${ID}: ${c.app} -> ${destination(c)}:${root(c)} (${c.source ?? 'git or rsync'})`);
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    const c = validate(config);
    const appEnv = renderEnv(c, (k) => ctx.secret(k));

    let source = c.source;
    let repo = c.repo;
    if (source !== 'rsync' && !repo) repo = await git(ctx.projectDir, ['remote', 'get-url', 'origin']);
    if (!source) source = repo ? 'git' : 'rsync';
    if (source === 'git' && !repo) fail('source git needs repo (no `origin` remote in the project)');

    let ref = c.ref;
    let sha = await git(ctx.projectDir, ['rev-parse', 'HEAD']);
    if (source === 'git' && !ref) {
      if (!sha) fail('cannot read HEAD; set ref');
      const pushed = await git(ctx.projectDir, ['branch', '-r', '--contains', sha!]);
      if (!pushed) fail(`HEAD ${sha!.slice(0, 7)} is not on any remote branch; push it first, or use source: rsync`);
      ref = sha;
    }
    if (source === 'git' && ref !== sha) sha = undefined;
    const release = releaseId(sha ?? (ref && /^[0-9a-f]{7,40}$/.test(ref) ? ref : undefined));
    const url = c.domains?.length ? `${c.tls === false ? 'http' : 'https'}://${c.domains[0]}` : undefined;

    ctx.log(`${ID}: ${c.app}@${release} via ${source}${repo ? ` from ${repo}` : ''} -> ${destination(c)}:${root(c)}`);
    if (ctx.dryRun) return { id: 'dry-run', url };

    if (source === 'rsync') {
      const rel = `${root(c)}/releases/${release}`;
      const sshCmd = ['ssh', ...sshOptions(c)].map((a) => (/^[A-Za-z0-9._/=:@-]+$/.test(a) ? a : shq(a))).join(' ');
      const res = await run('rsync', [
        '-az', '--delete', '--exclude=.git', '--filter=:- .gitignore',
        '-e', sshCmd,
        '--rsync-path', `mkdir -p ${shq(rel)} && rsync`,
        `${ctx.projectDir.replace(/\/+$/, '')}/`, `${destination(c)}:${rel}/`,
      ], { log: ctx.log });
      if (res.exitCode !== 0) fail(`rsync failed (exit ${res.exitCode})`);
    }

    const vars: Record<string, string> = {
      ...baseVars(c, 'deploy'),
      SOURCE: source!,
      REPO: repo ?? '',
      REF: ref ?? sha ?? 'local',
      RELEASE: release,
      FALLBACK_B64: Buffer.from(scriptText('install.sh')).toString('base64'),
    };
    if (appEnv !== undefined) {
      vars.ENV_MANAGED = '1';
      vars.APP_ENV_B64 = Buffer.from(appEnv).toString('base64');
    }
    const res = await remote(c, vars, ctx.log);
    if (res.exitCode !== 0) fail(`deploy to ${c.host} failed (exit ${res.exitCode}); the previous release is still serving`);
    return {
      id: `${c.app}@${res.fields.release ?? release}`,
      url,
      meta: { host: c.host, release: res.fields.release ?? release, sha: res.fields.sha, previous: res.fields.previous || undefined },
    };
  },

  async status(_shipId, config): Promise<TargetStatus> {
    const c = validate(config);
    const res = await remote(c, { ...baseVars(c, 'status'), FALLBACK_B64: Buffer.from(scriptText('install.sh')).toString('base64') }, quiet);
    const f = res.fields;
    if (res.exitCode !== 0 || !f.current) return { state: 'failed', message: res.stderr.trim() || 'no current release' };
    const up = f.runtime === 'static' || (f.active === 'active' && f.health !== 'down');
    return {
      state: up ? 'live' : 'failed',
      version: f.current,
      url: f.domains ? `https://${f.domains}` : undefined,
      message: `unit ${f.unit ?? '-'} ${f.active ?? ''} health ${f.health ?? '-'}`.trim(),
    };
  },

  async rollback(shipId, config) {
    const c = validate(config);
    const vars = { ...baseVars(c, 'rollback'), FALLBACK_B64: Buffer.from(scriptText('install.sh')).toString('base64') };
    // Back to the release before the current one; `shipId` names the one being left.
    void shipId;
    const res = await remote(c, vars, quiet);
    if (res.exitCode !== 0) fail(`rollback on ${c.host} failed (exit ${res.exitCode})`);
  },

  setup: manualSetup({
    label: 'Your server over ssh',
    vendorDocUrl: 'https://sh1pt.com',
    steps: [
      'Make sure `ssh <user>@<host>` works with a key (BatchMode: no password prompt)',
      'Give that user passwordless sudo (systemd units, nginx, certbot, apt)',
      'For a private repo, add a read-only deploy key on the box for your git host (GitHub, GitLab, Codeberg, Gitea...)',
      'Point DNS for your domains at the box before the first ship so certbot can issue TLS',
      'Put secrets in the vault: sh1pt secret set <KEY> <value>, and list the keys under env:',
    ],
  }),
});
