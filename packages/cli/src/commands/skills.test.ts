import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { skillsCmd } from './skills.js';

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
