import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { goalsPath, parseGoalAssignments, readIterateGoals, saveIterateGoals } from './iterate-goals.js';

describe('iterate goals persistence', () => {
  beforeEach(async () => {
    process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), 'sh1pt-goals-'));
  });

  it('parses key=value goal assignments', () => {
    expect(parseGoalAssignments(['conversion=8%', 'cpi=2.00'])).toEqual([
      { key: 'conversion', value: '8%' },
      { key: 'cpi', value: '2.00' },
    ]);
  });

  it('rejects malformed goal assignments', () => {
    expect(() => parseGoalAssignments(['conversion'])).toThrow('Use key=value');
    expect(() => parseGoalAssignments(['=8%'])).toThrow('Use key=value');
    expect(() => parseGoalAssignments(['bad key=8%'])).toThrow('Malformed goal key');
    expect(() => parseGoalAssignments(['conversion='])).toThrow('Use key=value');
  });

  it('saves and reads goals in stable key order', async () => {
    await saveIterateGoals(parseGoalAssignments(['conversion=8%', 'cpi=2.00']));
    await saveIterateGoals(parseGoalAssignments(['churn=5%', 'conversion=9%']));

    await expect(readIterateGoals()).resolves.toEqual([
      { key: 'churn', value: '5%' },
      { key: 'conversion', value: '9%' },
      { key: 'cpi', value: '2.00' },
    ]);
  });

  it('persists goals in the sh1pt config directory', async () => {
    await saveIterateGoals(parseGoalAssignments(['conversion=8%']));

    expect(goalsPath()).toContain('/sh1pt/iterate-goals.json');
    await expect(readFile(goalsPath(), 'utf8')).resolves.toContain('"conversion": "8%"');
  });
});
