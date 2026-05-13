import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { buildCmd } from './build.js';
import { configCmd } from './config.js';
import { promoteCmd } from './promote.js';
import { scaleCmd } from './scale.js';

const roots = [buildCmd, configCmd, promoteCmd, scaleCmd];

function walk(command: Command, path: string[] = []): Array<{ path: string[]; command: Command }> {
  const current = [...path, command.name()];
  return [
    { path: current, command },
    ...command.commands.flatMap((child) => walk(child, current)),
  ];
}

function hasJsonOption(command: Command): boolean {
  return command.options.some((option) => option.long === '--json');
}

describe('CLI JSON output convention', () => {
  it('adds --json to every list and status subcommand under the primary verbs', () => {
    const missing = roots
      .flatMap((root) => walk(root))
      .filter(({ path }) => ['list', 'status'].includes(path.at(-1) ?? ''))
      .filter(({ command }) => !hasJsonOption(command))
      .map(({ path }) => path.join(' '));

    expect(missing).toEqual([]);
  });
});
