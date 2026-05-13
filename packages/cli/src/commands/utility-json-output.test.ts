import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { agentsCmd } from './agents.js';
import { makeCategoryCmd } from './adapter-cmd.js';
import { secretsCmd } from './secrets.js';
import type { AdapterCategory } from '../adapter-registry.js';

const sampleCategory: AdapterCategory = {
  id: 'bots',
  pkgPrefix: '@profullstack/sh1pt-bot',
  description: 'Bot adapters',
  adapters: ['discord'],
};

function findCommand(root: Command, path: string[]): Command | undefined {
  const [name, ...rest] = path;
  if (root.name() !== name) return undefined;
  return rest.reduce<Command | undefined>(
    (command, childName) => command?.commands.find((child) => child.name() === childName),
    root,
  );
}

function hasJsonOption(command: Command): boolean {
  return command.options.some((option) => option.long === '--json');
}

describe('utility CLI JSON output', () => {
  it('adds --json to non-primary list commands', () => {
    const adapterCmd = makeCategoryCmd(sampleCategory);
    const commands = [
      findCommand(agentsCmd, ['agents', 'list']),
      findCommand(secretsCmd, ['secret', 'list']),
      findCommand(adapterCmd, ['bots', 'list']),
    ];

    expect(commands.every((command) => command && hasJsonOption(command))).toBe(true);
  });
});
