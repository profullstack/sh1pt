import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { scaleCmd } from './scale.js';

const commandsThatMutateInfra = [
  ['scale', 'up'],
  ['scale', 'down'],
  ['scale', 'auto'],
  ['scale', 'dns'],
  ['scale', 'rollout'],
  ['scale', 'deploy', 'destroy'],
];

function findCommand(root: Command, path: string[]): Command | undefined {
  const [name, ...rest] = path;
  if (root.name() !== name) return undefined;
  return rest.reduce<Command | undefined>(
    (command, childName) => command?.commands.find((child) => child.name() === childName),
    root,
  );
}

function hasDryRunOption(command: Command): boolean {
  return command.options.some((option) => option.long === '--dry-run');
}

describe('CLI dry-run guardrails', () => {
  it('keeps mutating scale commands previewable', () => {
    const missing = commandsThatMutateInfra
      .map((path) => ({ path, command: findCommand(scaleCmd, path) }))
      .filter(({ command }) => !command || !hasDryRunOption(command))
      .map(({ path }) => path.join(' '));

    expect(missing).toEqual([]);
  });

  it('does not shadow the top-level version flag on scale rollout', () => {
    const rollout = findCommand(scaleCmd, ['scale', 'rollout']);

    expect(rollout?.options.some((option) => option.long === '--release')).toBe(true);
    expect(rollout?.options.some((option) => option.long === '--version')).toBe(false);
  });
});
