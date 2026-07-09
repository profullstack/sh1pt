import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadBuiltinSkills,
  planSkillInstall,
  resolveSkillTargetPath,
  skillsCmd,
} from './skills.js';

describe('builtin skills', () => {
  it('loads the modern-web skill', async () => {
    const catalog = await loadBuiltinSkills();
    const entry = catalog.get('modern-web');
    expect(entry).toBeDefined();
    expect(entry?.manifest.title).toBe('Modern Web Guidance');
    expect(entry?.content).toContain('Prefer reviewable, framework-native changes');
  });

  it('maps supported targets to expected paths', () => {
    expect(resolveSkillTargetPath('agents-md', 'modern-web')).toBe('AGENTS.md');
    expect(resolveSkillTargetPath('claude', 'modern-web')).toBe('CLAUDE.md');
    expect(resolveSkillTargetPath('copilot', 'modern-web')).toBe('.github/copilot-instructions.md');
    expect(resolveSkillTargetPath('cursor', 'modern-web')).toBe('.cursor/rules/modern-web.mdc');
  });

  it('appends a managed block to existing content', async () => {
    const catalog = await loadBuiltinSkills();
    const entry = catalog.get('modern-web');
    if (!entry) throw new Error('modern-web missing');

    const plan = planSkillInstall(entry, 'agents-md', '# Existing\n');
    expect(plan.action).toBe('append');
    expect(plan.content).toContain('# Existing');
    expect(plan.content).toContain('<!-- sh1pt-skill:modern-web start -->');
  });

  it('updates an existing managed block in place', async () => {
    const catalog = await loadBuiltinSkills();
    const entry = catalog.get('modern-web');
    if (!entry) throw new Error('modern-web missing');

    const existing = [
      '# Existing',
      '',
      '<!-- sh1pt-skill:modern-web start -->',
      'old content',
      '<!-- sh1pt-skill:modern-web end -->',
      '',
    ].join('\n');

    const plan = planSkillInstall(entry, 'agents-md', existing);
    expect(plan.action).toBe('update-managed');
    expect(plan.content).not.toContain('old content');
    expect(plan.content).toContain('Modern Web Guidance');
  });
});

describe('skills install command', () => {
  let stdout: string[];
  let tempDir: string;

  beforeEach(() => {
    stdout = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('supports dry-run install without writing files', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-skills-'));
    const installCmd = skillsCmd.commands.find((c) => c.name() === 'install');
    expect(installCmd).toBeDefined();

    await installCmd?.parseAsync(['modern-web', '--repo', tempDir, '--target', 'copilot'], { from: 'user' });

    expect(stdout.join('\n')).toContain('Dry-run');
    expect(existsSync(join(tempDir, '.github', 'copilot-instructions.md'))).toBe(false);
  });

  it('writes the selected target file with managed markers when --yes is used', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-skills-'));
    const installCmd = skillsCmd.commands.find((c) => c.name() === 'install');
    expect(installCmd).toBeDefined();

    await installCmd?.parseAsync(['modern-web', '--repo', tempDir, '--target', 'copilot', '--yes'], { from: 'user' });

    const file = join(tempDir, '.github', 'copilot-instructions.md');
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('<!-- sh1pt-skill:modern-web start -->');
    expect(content).toContain('Modern Web Guidance');
    expect(content).toContain('Prefer least-privilege GitHub Actions permissions.');
  });
});

describe('skills marketplaces --json', () => {
  let stdout: string[];

  beforeEach(() => {
    stdout = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs human-readable list by default', () => {
    const mktCmd = skillsCmd.commands.find((c) => c.name() === 'marketplaces')!;
    mktCmd.parse([], { from: 'user' });
    const output = stdout.join('\n');
    expect(output).toContain('ugig');
    expect(output).toContain('clawhub');
  });

  it('outputs valid JSON when --json is passed', () => {
    const mktCmd = skillsCmd.commands.find((c) => c.name() === 'marketplaces')!;
    mktCmd.parse(['--json'], { from: 'user' });
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('name');
    expect(parsed[0]).toHaveProperty('method');
    expect(parsed[0]).toHaveProperty('readiness');
  });

  it('JSON output has correct structure for each marketplace', () => {
    const mktCmd = skillsCmd.commands.find((c) => c.name() === 'marketplaces')!;
    mktCmd.parse(['--json'], { from: 'user' });
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    for (const mp of parsed) {
      expect(typeof mp.id).toBe('string');
      expect(typeof mp.name).toBe('string');
      expect(typeof mp.method).toBe('string');
      expect(typeof mp.readiness).toBe('string');
    }
  });
});

describe('skills new command', () => {
  let tempDir: string;
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-skills-new-'));
    stdout = [];
    stderr = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeSkillFile() {
    const skillDir = join(tempDir, 'skill');
    mkdirSync(skillDir, { recursive: true });
    const skillFile = join(skillDir, 'SKILL.md');
    writeFileSync(skillFile, [
      '---',
      'name: invoice-helper',
      'description: Helps prepare invoices',
      '---',
      '',
      '# Invoice Helper',
      '',
    ].join('\n'));
    return skillFile;
  }

  async function runNew(price: string) {
    const newCmd = skillsCmd.commands.find((c) => c.name() === 'new')!;
    const skillFile = writeSkillFile();
    const out = join(tempDir, 'sh1pt.skill.json');
    await newCmd.parseAsync([
      '--skill-file', skillFile,
      '--out', out,
      '--price', price,
    ], { from: 'user' });
    return out;
  }

  it('writes valid integer prices to the manifest and marketplace command', async () => {
    const out = await runNew('100');
    const manifest = JSON.parse(readFileSync(out, 'utf8'));

    expect(manifest.price).toBe(100);
    expect(manifest.marketplaces.ugig.command).toContain('--price 100');
    expect(stdout.join('\n')).toContain('wrote');
  });

  it.each(['-5', '1.9', '5abc', '1e2', '0x10', '+5', `${Number.MAX_SAFE_INTEGER + 1}`])(
    'rejects invalid listing price %s before writing a manifest',
    async (price) => {
      const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
        throw new Error(`process.exit(${code})`);
      }) as never);

      await expect(runNew(price)).rejects.toThrow('process.exit(1)');
      expect(stderr.join('\n')).toContain('--price');
      expect(existsSync(join(tempDir, 'sh1pt.skill.json'))).toBe(false);
      expect(exit).toHaveBeenCalledWith(1);
    },
  );
});
