import { describe, expect, it } from 'vitest';
import { runsCmd } from './runs.js';

describe('run command registration', () => {
  it('registers cloud run subcommands', () => {
    const subcommands = runsCmd.commands.map((command) => command.name());

    expect(subcommands).toContain('list');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('logs');
    expect(subcommands).toContain('artifacts');
  });
});
