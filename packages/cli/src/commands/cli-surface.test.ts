import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const commandsDir = dirname(fileURLToPath(import.meta.url));

function commandSource(fileName: string): string {
  return readFileSync(join(commandsDir, fileName), 'utf8');
}

describe('documented sh1pt CLI surface', () => {
  it('keeps the four primary tagline verbs registered', () => {
    expect(commandSource('build.ts')).toContain("new Command('build')");
    expect(commandSource('promote.ts')).toContain("new Command('promote')");
    expect(commandSource('scale.ts')).toContain("new Command('scale')");
    expect(commandSource('iterate.ts')).toContain("new Command('iterate')");
  });

  it('keeps key documented subcommands under the primary verbs', () => {
    const build = commandSource('build.ts');
    const promote = commandSource('promote.ts');
    const scale = commandSource('scale.ts');
    const iterate = commandSource('iterate.ts');

    expect(build).toContain('buildCmd.addCommand(entityCmd)');
    expect(build).toContain('buildCmd.addCommand(createActionsCmd())');
    expect(build).toContain("'patch'");

    for (const subcommand of ['setup', 'status', 'stop', 'creatives']) {
      expect(promote).toContain(`.command('${subcommand}')`);
    }
    expect(promote).toContain('promoteCmd.addCommand(shipSub)');
    expect(promote).toContain('promoteCmd.addCommand(merchCmd)');

    for (const subcommand of ['up', 'down', 'auto', 'dns', 'rollout', 'cost', 'status']) {
      expect(scale).toContain(`.command('${subcommand}')`);
    }

    for (const subcommand of ['run', 'watch', 'goals', 'test <hypothesis>', 'experiments']) {
      expect(iterate).toContain(`.command('${subcommand}')`);
    }
  });

  it('keeps promoted shipping workflow subcommands mirrored by ship', () => {
    const ship = commandSource('ship.ts');

    for (const subcommand of ['init', 'status', 'target', 'setup', 'rollback', 'lint', 'logs']) {
      expect(ship).toContain(`.command('${subcommand}')`);
    }
  });
});
