import { fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock, runMock } = vi.hoisted(() => ({ execMock: vi.fn(), runMock: vi.fn() }));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

vi.mock('./ssh.js', async () => ({
  ...await vi.importActual<typeof import('./ssh.js')>('./ssh.js'),
  run: runMock,
}));

import adapter, { installerVars, releaseId, remoteScript, renderEnv, validate } from './index.js';

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

const base = { host: 'dev3.profullstack.com', user: 'anthony', app: 'myapp' };

function gitAnswers(map: Record<string, string | undefined>) {
  execMock.mockImplementation(async (_cmd: string, args: string[]) => {
    const key = args.slice(2).join(' ');
    const hit = Object.entries(map).find(([k]) => key.startsWith(k));
    return hit && hit[1] !== undefined
      ? { exitCode: 0, stdout: `${hit[1]}\n`, stderr: '' }
      : { exitCode: 128, stdout: '', stderr: 'fatal' };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  runMock.mockResolvedValue({ exitCode: 0, stdout: 'SH1PT release=20261001120000-abc1234 sha=abc1234def previous=20260930000000-0000000\n', stderr: '' });
});

describe('config', () => {
  it('rejects what would reach a shell or a path unsafely', () => {
    expect(() => validate({ ...base, host: '' })).toThrow('deploy-ssh requires host');
    expect(() => validate({ ...base, host: 'a b' })).toThrow('host must be');
    expect(() => validate({ ...base, app: 'My_App' })).toThrow('app must be');
    expect(() => validate({ ...base, dir: 'apps/x y' })).toThrow('dir must be');
    expect(() => validate({ ...base, ref: 'main;rm' })).toThrow('ref must be');
    expect(() => validate({ ...base, domains: ['ex ample.com'] })).toThrow('domains must be');
    expect(() => validate({ ...base, port: 70000 })).toThrow('port must be');
    expect(() => validate({ ...base, env: ['BAD-KEY'] })).toThrow('env must be');
    expect(() => validate({ ...base, postgres: 'Robert"); DROP' })).toThrow('postgres must be');
    expect(validate({ ...base, sshPort: '2222', domains: ['example.com', 'www.example.com'] }).sshPort).toBe(2222);
  });

  it('passes only the installer settings the manifest gives', () => {
    expect(installerVars(validate(base))).toEqual({});
    expect(installerVars(validate({ ...base, port: 3100, domains: ['a.com', 'b.com'], tls: false, postgres: true, start: 'bun run start' }))).toEqual({
      PORT: '3100', DOMAINS: 'a.com b.com', TLS: '0', POSTGRES: '1', START_CMD: 'bun run start',
    });
  });

  it('writes app.env from the vault and refuses values a shell and systemd would read differently', () => {
    const vault: Record<string, string> = { API_KEY: 'sk-123', PEM: 'a\nb', QUOTE: "it's" };
    const secret = (k: string) => vault[k];
    expect(renderEnv(validate(base), secret)).toBeUndefined();
    expect(renderEnv(validate({ ...base, env: ['API_KEY'], vars: { MODE: 'prod' } }), secret)).toBe("MODE='prod'\nAPI_KEY='sk-123'\n");
    expect(() => renderEnv(validate({ ...base, env: ['NOPE'] }), secret)).toThrow('missing secrets NOPE');
    expect(() => renderEnv(validate({ ...base, env: ['PEM'] }), secret)).toThrow('quote or newline');
    expect(() => renderEnv(validate({ ...base, env: ['QUOTE'] }), secret)).toThrow('quote or newline');
  });

  it('makes sortable release ids', () => {
    expect(releaseId('abcdef1234', new Date('2026-10-01T12:34:56Z'))).toBe('20261001123456-abcdef1');
    expect(releaseId(undefined, new Date('2026-10-01T12:34:56Z'))).toBe('20261001123456-local');
  });

  it('quotes every exported value', () => {
    const s = remoteScript({ REPO: "git@x:o/r.git", EVIL: "'; rm -rf / #" });
    expect(s).toContain("export EVIL=''\\''; rm -rf / #'");
    expect(s).toContain('ACTION must be deploy, status or rollback');
  });
});

describe('ship', () => {
  it('dry-run touches nothing remote', async () => {
    gitAnswers({ 'remote get-url': 'https://codeberg.org/me/myapp.git', 'rev-parse HEAD': 'abc1234def', 'branch -r': 'origin/main' });
    const r = await adapter.ship(fakeShipContext({ dryRun: true }) as any, { ...base, domains: ['myapp.com'] });
    expect(r).toEqual({ id: 'dry-run', url: 'https://myapp.com' });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('refuses to deploy a HEAD the box cannot fetch', async () => {
    gitAnswers({ 'remote get-url': 'git@git.chovy.com:me/myapp.git', 'rev-parse HEAD': 'abc1234def', 'branch -r': '' });
    await expect(adapter.ship(fakeShipContext({ dryRun: false }) as any, base)).rejects.toThrow('not on any remote branch');
  });

  it('deploys from any git host with secrets on stdin, never in argv', async () => {
    gitAnswers({ 'remote get-url': 'git@gitlab.com:me/myapp.git', 'rev-parse HEAD': 'abc1234def', 'branch -r': 'origin/main' });
    const ctx = fakeShipContext({ dryRun: false, secrets: { API_KEY: 'sk-secret' } } as any) as any;
    if (!ctx.secret('API_KEY')) ctx.secret = (k: string) => (k === 'API_KEY' ? 'sk-secret' : undefined);
    const r = await adapter.ship(ctx, { ...base, sshPort: 2222, env: ['API_KEY'], domains: ['myapp.com'] });

    expect(runMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = runMock.mock.calls[0]!;
    expect(cmd).toBe('ssh');
    expect(args).toEqual(['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-p', '2222', 'anthony@dev3.profullstack.com', 'bash -s']);
    expect(JSON.stringify(args)).not.toContain('sk-secret');
    expect(opts.input).toContain("export SOURCE='git'");
    expect(opts.input).toContain("export REPO='git@gitlab.com:me/myapp.git'");
    expect(opts.input).toContain("export REF='abc1234def'");
    expect(opts.input).toContain(`export APP_ENV_B64='${Buffer.from("API_KEY='sk-secret'\n").toString('base64')}'`);
    expect(r).toMatchObject({ id: 'myapp@20261001120000-abc1234', url: 'https://myapp.com', meta: { previous: '20260930000000-0000000' } });
  });

  it('rsyncs the working tree when there is no remote', async () => {
    gitAnswers({});
    await adapter.ship(fakeShipContext({ dryRun: false, projectDir: '/work/myapp' } as any) as any, { ...base, dir: '~/srv/myapp' });
    expect(runMock).toHaveBeenCalledTimes(2);
    const [cmd, args] = runMock.mock.calls[0]!;
    expect(cmd).toBe('rsync');
    expect(args).toContain('--filter=:- .gitignore');
    expect(args.at(-2)).toBe('/work/myapp/');
    expect(args.at(-1)).toMatch(/^anthony@dev3\.profullstack\.com:srv\/myapp\/releases\/\d{14}-local\/$/);
    expect(runMock.mock.calls[1]![2].input).toContain("export SOURCE='rsync'");
  });

  it('reports a failed deploy as an error', async () => {
    gitAnswers({ 'remote get-url': 'https://github.com/me/myapp.git', 'rev-parse HEAD': 'abc1234def', 'branch -r': 'origin/main' });
    runMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'boom' });
    await expect(adapter.ship(fakeShipContext({ dryRun: false }) as any, base)).rejects.toThrow('previous release is still serving');
  });
});

// The real scripts, run locally: git source, static runtime, no domains, so no
// sudo is needed. Proves release placement, the atomic flip, restore on a
// failed activation, rollback and pruning.
const hasTools = spawnSync('git', ['--version']).status === 0 && spawnSync('bash', ['--version']).status === 0;
describe.skipIf(!hasTools)('deploy-remote.sh end to end', () => {
  const work = mkdtempSync(join(tmpdir(), 'sh1pt-deploy-ssh-'));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const home = join(work, 'home');
  const repo = join(work, 'repo');
  const root = join(home, 'apps', 'site');
  mkdirSync(home, { recursive: true });

  const g = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  const commit = (html: string | null) => {
    rmSync(join(repo, 'dist'), { recursive: true, force: true });
    if (html !== null) { mkdirSync(join(repo, 'dist'), { recursive: true }); writeFileSync(join(repo, 'dist', 'index.html'), html); }
    writeFileSync(join(repo, 'stamp'), String(Math.random()));
    g('add', '-A'); g('commit', '-qm', html ?? 'broken');
    return g('rev-parse', 'HEAD');
  };
  const remote = (vars: Record<string, string>) => spawnSync('bash', ['-s'], {
    input: remoteScript({ APP: 'site', ROOT: 'apps/site', KEEP: '2', FALLBACK_B64: '', ...vars }),
    env: { PATH: process.env.PATH ?? '', HOME: home },
    encoding: 'utf8',
  });
  const current = () => readFileSync(join(root, 'current', 'dist', 'index.html'), 'utf8');

  mkdirSync(join(repo, 'bin'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  writeFileSync(join(repo, 'bin', 'install.sh'), readFileSync(new URL('../bin/install.sh', import.meta.url)));
  writeFileSync(join(repo, 'bin', 'install.conf'), 'RUNTIME=static\n');

  const deploy = (sha: string, n: number) => remote({ ACTION: 'deploy', SOURCE: 'git', REPO: repo, REF: sha, RELEASE: `2026100112000${n}-${sha.slice(0, 7)}`, ENV_MANAGED: '1', APP_ENV_B64: Buffer.from("A='1'\n").toString('base64') });

  it('deploys, survives a broken release, rolls back and prunes', () => {
    const one = commit('one');
    let r = deploy(one, 1);
    expect(r.status, r.stderr).toBe(0);
    expect(current()).toBe('one');
    expect(readFileSync(join(root, 'shared', 'app.env'), 'utf8')).toBe("A='1'\n");

    const two = commit('two');
    r = deploy(two, 2);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`previous=20261001120001-${one.slice(0, 7)}`);
    expect(current()).toBe('two');

    const broken = commit(null);
    r = deploy(broken, 3);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('failed to activate');
    expect(current()).toBe('two');

    r = remote({ ACTION: 'rollback' });
    expect(r.status, r.stderr).toBe(0);
    expect(current()).toBe('one');
    expect(readlinkSync(join(root, 'current'))).toContain('20261001120001');

    const four = commit('four');
    expect(deploy(four, 4).status).toBe(0);
    const left = readdirSync(join(root, 'releases'));
    expect(left.length).toBeLessThanOrEqual(3);
    expect(left).toContain(`20261001120004-${four.slice(0, 7)}`);
    expect(existsSync(join(root, 'repo.git'))).toBe(true);

    r = remote({ ACTION: 'status' });
    expect(r.stdout).toContain(`SH1PT current=20261001120004-${four.slice(0, 7)}`);
    expect(r.stdout).toContain('SH1PT runtime=static');
  });
});
