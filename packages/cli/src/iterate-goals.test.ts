import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatIterateGoals,
  parseGoalAssignments,
  readIterateGoals,
  writeIterateGoals,
} from './iterate-goals.js';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function tempFile(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sh1pt-iterate-goals-'));
  tempDirs.push(dir);
  return path.join(dir, 'iterate-goals.json');
}

describe('iterate goals', () => {
  it('parses documented goals set syntax', () => {
    expect(parseGoalAssignments(['set', 'conversion=8%', 'cpi=2.00'])).toEqual({
      conversion: '8%',
      cpi: '2.00',
    });
  });

  it('rejects malformed goals', () => {
    expect(() => parseGoalAssignments(['conversion'])).toThrow('Use key=value');
  });

  it('persists goals to a local JSON store', async () => {
    const file = await tempFile();

    await writeIterateGoals({ conversion: '8%', cpi: '2.00' }, file);

    expect(await readIterateGoals(file)).toEqual({
      conversion: '8%',
      cpi: '2.00',
    });
  });

  it('formats goals in stable key order', () => {
    expect(formatIterateGoals({ cpi: '2.00', conversion: '8%' })).toEqual([
      'conversion=8%',
      'cpi=2.00',
    ]);
  });
});
