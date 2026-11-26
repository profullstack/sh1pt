// The credential gate in the threatcrush-scan pack: a heredoc'd Python program
// inside the rendered workflow. Rendered and executed here for real, because a
// gate that only exists as a string in a YAML file can be wrong in every way a
// string assertion cannot see.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { renderPack } from '@profullstack/sh1pt-actions-fleet-core';
import { loadBuiltinPacks } from './index.js';

type Step = { name?: string; id?: string; if?: string; run?: string };

async function render(inputs: Record<string, string> = {}): Promise<Step[]> {
  const entry = (await loadBuiltinPacks()).get('threatcrush-scan');
  if (!entry) throw new Error('threatcrush-scan not in catalog');
  const result = await renderPack({ packDir: entry.packDir, manifest: entry.manifest, inputs });
  return parseYaml(result.files[0]?.content ?? '')?.jobs?.scan?.steps ?? [];
}

function gateProgram(steps: Step[]): string {
  const run = steps.find((s) => s.id === 'gate')?.run ?? '';
  const m = run.match(/<<'PY'\n([\s\S]*?)\nPY/);
  if (!m) throw new Error('gate step has no python heredoc');
  return m[1];
}

// Values assembled at runtime so this file never holds anything key-shaped.
const fake = (n: number) => Array.from({ length: n }, (_, i) => 'abcdefghjkmnpqrstuvwxyz23456789'[(i * 7) % 31]).join('');

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function runGate(
  program: string,
  files: Record<string, string>,
  changed: string[],
  results: { ruleId: string; level: string; uri: string; line?: number }[] = [],
): { code: number; out: string } {
  const repo = mkdtempSync(join(tmpdir(), 'tc-gate-'));
  const temp = mkdtempSync(join(tmpdir(), 'tc-gate-tmp-'));
  dirs.push(repo, temp);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), body);
  }
  writeFileSync(join(temp, 'threatcrush-changed.txt'), changed.join('\n') + '\n');
  writeFileSync(
    join(repo, 'threatcrush.sarif'),
    JSON.stringify({
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'ThreatCrush' } },
        results: results.map((r) => ({
          ruleId: r.ruleId,
          level: r.level,
          locations: [{ physicalLocation: { artifactLocation: { uri: r.uri }, region: { startLine: r.line ?? 1 } } }],
        })),
      }],
    }),
  );
  try {
    const out = execFileSync('python3', ['-'], {
      cwd: repo,
      input: program,
      env: { ...process.env, RUNNER_TEMP: temp, SCAN_PATH: '.' },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status: number; stdout: string };
    return { code: e.status, out: e.stdout };
  }
}

describe('threatcrush-scan credential gate', () => {
  it('is rendered by default, scoped to the diff, and omitted when switched off', async () => {
    const on = await render();
    const gate = on.find((s) => s.id === 'gate');
    expect(gate?.name).toBe('Block credentials this pull request adds');
    expect(gate?.if).toContain("steps.changed.outputs.scoped == 'true'");
    expect(gate?.if).toContain("steps.scan.outputs.status != 'error'");
    expect((await render({ blockDiffSecrets: 'false' })).some((s) => s.id === 'gate')).toBe(false);
  });

  it('blocks a committed production env backup (crawlproof.com#160)', async () => {
    const program = gateProgram(await render());
    const env = `NEXT_PUBLIC_SITE_URL=https://example.com\nSP_TOKEN_PEPPER=${fake(44)}\nDATAFORSEO_PASSWORD=${fake(12)}\n`;
    const r = runGate(program, { '.env.bak-2026-07-28': env, 'lib/a.ts': 'x' }, ['.env.bak-2026-07-28', 'lib/a.ts']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('file=.env.bak-2026-07-28,line=2');
    expect(r.out).toContain('2 secret-looking value(s)');
    expect(r.out).not.toContain(fake(44));
  });

  it('catches the dev2 naming too: app.env, deploy.env.bak-1', async () => {
    const program = gateProgram(await render());
    const env = `API_TOKEN=${fake(30)}\n`;
    for (const name of ['app.env', 'ops/deploy.env.bak-1', '.env', '.env.production']) {
      expect(runGate(program, { [name]: env }, [name]).code).toBe(1);
    }
  });

  it('lets templates, placeholders, source files, deletions and ignored paths through', async () => {
    const program = gateProgram(await render());
    const real = `API_TOKEN=${fake(30)}\n`;
    const r = runGate(
      program,
      {
        '.env.example': real,
        '.env.test': 'API_KEY=changeme\nSECRET=<your-secret>\nTOKEN=${TOKEN}\nPASSWORD=xxxxxxxxxx\n',
        'src/config.env.ts': `export const API_TOKEN = "${fake(30)}";\n`,
        'fixtures/.env.fixture': real,
        '.threatcrushignore': 'fixtures/*\n',
      },
      ['.env.example', '.env.test', 'src/config.env.ts', 'fixtures/.env.fixture', '.env.removed'],
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain('No credentials added');
  });

  it('blocks scanner secrets in changed files only, and only at level error', async () => {
    const program = gateProgram(await render());
    const files = { 'lib/a.ts': 'x', 'lib/old.ts': 'y' };
    expect(runGate(program, files, ['lib/a.ts'], [{ ruleId: 'secret-openai-key', level: 'error', uri: 'lib/old.ts' }]).code).toBe(0);
    expect(runGate(program, files, ['lib/a.ts'], [{ ruleId: 'secret-hex-token', level: 'warning', uri: 'lib/a.ts' }]).code).toBe(0);
    expect(runGate(program, files, ['lib/a.ts'], [{ ruleId: 'sql-injection', level: 'error', uri: 'lib/a.ts' }]).code).toBe(0);
    const hit = runGate(program, files, ['lib/a.ts'], [{ ruleId: 'secret-openai-key', level: 'error', uri: 'lib/a.ts', line: 7 }]);
    expect(hit.code).toBe(1);
    expect(hit.out).toContain('file=lib/a.ts,line=7,title=ThreatCrush secret-openai-key');
  });

  it('fails closed on an unreadable SARIF file', async () => {
    const program = gateProgram(await render());
    const repo = mkdtempSync(join(tmpdir(), 'tc-gate-'));
    const temp = mkdtempSync(join(tmpdir(), 'tc-gate-tmp-'));
    dirs.push(repo, temp);
    writeFileSync(join(temp, 'threatcrush-changed.txt'), '');
    writeFileSync(join(repo, 'threatcrush.sarif'), '{not json');
    let code = 0;
    try {
      execFileSync('python3', ['-'], { cwd: repo, input: program, env: { ...process.env, RUNNER_TEMP: temp }, encoding: 'utf8' });
    } catch (err) {
      code = (err as { status: number }).status;
    }
    expect(code).toBe(1);
  });
});
