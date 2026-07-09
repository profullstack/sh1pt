import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCategoryCmd } from './adapter-cmd.js';
import type { AdapterCategory } from '../adapter-registry.js';

const testCategory: AdapterCategory = {
  id: 'bots',
  pkgPrefix: '@profullstack/sh1pt-bot',
  description: 'Chat bots — Discord, Telegram, Slack',
  adapters: ['discord', 'telegram', 'slack'],
};

describe('adapter category list --json', () => {
  let stdout: string[];
  let cmd: ReturnType<typeof makeCategoryCmd>;

  beforeEach(() => {
    stdout = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout.push(args.map(String).join(' '));
    });
    cmd = makeCategoryCmd(testCategory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs human-readable list by default', () => {
    const listCmd = cmd.commands.find((c) => c.name() === 'list')!;
    listCmd.parse([], { from: 'user' });
    const output = stdout.join('\n');
    expect(output).toContain('discord');
    expect(output).toContain('telegram');
    expect(output).toContain('slack');
  });

  it('outputs valid JSON when --json is passed', () => {
    const listCmd = cmd.commands.find((c) => c.name() === 'list')!;
    listCmd.parse(['--json'], { from: 'user' });
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toHaveProperty('name', 'discord');
    expect(parsed[0]).toHaveProperty('package');
    expect(parsed[0]).toHaveProperty('setupCommand');
  });

  it('JSON output includes correct package names', () => {
    const listCmd = cmd.commands.find((c) => c.name() === 'list')!;
    listCmd.parse(['--json'], { from: 'user' });
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed[0].package).toBe('@profullstack/sh1pt-bot-discord');
    expect(parsed[1].package).toBe('@profullstack/sh1pt-bot-telegram');
    expect(parsed[2].package).toBe('@profullstack/sh1pt-bot-slack');
  });

  it('JSON output includes correct setup commands', () => {
    const listCmd = cmd.commands.find((c) => c.name() === 'list')!;
    listCmd.parse(['--json'], { from: 'user' });
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed[0].setupCommand).toBe('sh1pt bots discord setup');
    expect(parsed[1].setupCommand).toBe('sh1pt bots telegram setup');
    expect(parsed[2].setupCommand).toBe('sh1pt bots slack setup');
  });
});
