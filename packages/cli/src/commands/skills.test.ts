import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

describe('skills new command', () => {
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

  function skillFixture(): { skillFile: string; manifestFile: string } {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-skills-new-'));
    const skillFile = join(tempDir, 'SKILL.md');
    const manifestFile = join(tempDir, 'sh1pt.skill.json');
    writeFileSync(skillFile, '---\nname: paid-helper\ndescription: Paid helper skill\n---\n', 'utf8');
    return { skillFile, manifestFile };
  }

  it('preserves a valid integer price in the manifest and marketplace commands', async () => {
    const { skillFile, manifestFile } = skillFixture();
    const newCmd = skillsCmd.commands.find((c) => c.name() === 'new');
    expect(newCmd).toBeDefined();

    await newCmd?.parseAsync(['--skill-file', skillFile, '--out', manifestFile, '--price', '42'], { from: 'user' });

    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    expect(manifest.price).toBe(42);
    expect(manifest.marketplaces.ugig.command).toContain('--price 42');
  });

  it('preserves zero as a valid price', async () => {
    const { skillFile, manifestFile } = skillFixture();
    const newCmd = skillsCmd.commands.find((c) => c.name() === 'new');
    expect(newCmd).toBeDefined();

    await newCmd?.parseAsync(['--skill-file', skillFile, '--out', manifestFile, '--price', '0'], { from: 'user' });

    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    expect(manifest.price).toBe(0);
    expect(manifest.marketplaces.ugig.command).toContain('--price 0');
  });

  it('rejects negative prices without writing a manifest', async () => {
    const { skillFile, manifestFile } = skillFixture();
    const newCmd = skillsCmd.commands.find((c) => c.name() === 'new');
    expect(newCmd).toBeDefined();

    await expect(newCmd?.parseAsync(['--skill-file', skillFile, '--out', manifestFile, '--price', '-5'], { from: 'user' }))
      .rejects.toThrow('--price must be a non-negative integer in sats');
    expect(existsSync(manifestFile)).toBe(false);
  });

  it('rejects fractional prices without truncating them', async () => {
    const { skillFile, manifestFile } = skillFixture();
    const newCmd = skillsCmd.commands.find((c) => c.name() === 'new');
    expect(newCmd).toBeDefined();

    await expect(newCmd?.parseAsync(['--skill-file', skillFile, '--out', manifestFile, '--price', '1.9'], { from: 'user' }))
      .rejects.toThrow('--price must be a non-negative integer in sats');
    expect(existsSync(manifestFile)).toBe(false);
  });

  it('rejects prices larger than Number.MAX_SAFE_INTEGER', async () => {
    const { skillFile, manifestFile } = skillFixture();
    const newCmd = skillsCmd.commands.find((c) => c.name() === 'new');
    expect(newCmd).toBeDefined();

    await expect(newCmd?.parseAsync(['--skill-file', skillFile, '--out', manifestFile, '--price', '9007199254740992'], { from: 'user' }))
      .rejects.toThrow('--price must be a safe non-negative integer in sats');
    expect(existsSync(manifestFile)).toBe(false);
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
