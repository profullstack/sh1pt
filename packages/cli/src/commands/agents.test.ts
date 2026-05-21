import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { agentsCmd } from './agents.js';

describe('agents list --json', () => {
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
    agentsCmd.commands.find((c) => c.name() === 'list')!.parse([], { from: 'user' });
    const output = stdout.join('\n');
    expect(output).toContain('claude');
    expect(output).toContain('codex');
    expect(output).toContain('qwen');
  });

  it('outputs valid JSON when --json is passed', () => {
    agentsCmd.commands.find((c) => c.name() === 'list')!.parse(['--json'], { from: 'user' });
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toHaveProperty('id', 'claude');
    expect(parsed[0]).toHaveProperty('package');
    expect(parsed[0]).toHaveProperty('setupCommand');
    expect(parsed[1]).toHaveProperty('id', 'codex');
    expect(parsed[2]).toHaveProperty('id', 'qwen');
  });

  it('JSON output includes package and setupCommand fields', () => {
    agentsCmd.commands.find((c) => c.name() === 'list')!.parse(['--json'], { from: 'user' });
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    for (const agent of parsed) {
      expect(typeof agent.id).toBe('string');
      expect(typeof agent.package).toBe('string');
      expect(typeof agent.setupCommand).toBe('string');
    }
  });
});
