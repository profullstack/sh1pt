import { describe, expect, it } from 'vitest';
import { promoteCmd } from './promote.js';

function findCommand(path: string[]) {
  let cmd = promoteCmd;
  for (const name of path) {
    const next = cmd.commands.find((child) => child.name() === name);
    if (!next) throw new Error(`missing command: promote ${path.join(' ')}`);
    cmd = next;
  }
  return cmd;
}

describe('promote social post command', () => {
  it('exposes the options needed for a real adapter-backed post', () => {
    const cmd = findCommand(['social', 'post']);
    const flags = cmd.options.map((option) => option.long);

    expect(flags).toContain('--body');
    expect(flags).toContain('--title');
    expect(flags).toContain('--hashtags');
    expect(flags).toContain('--media');
    expect(flags).toContain('--link');
    expect(flags).toContain('--platform');
    expect(flags).toContain('--schedule');
    expect(flags).toContain('--dry-run');
  });
});
