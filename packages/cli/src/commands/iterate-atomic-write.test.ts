import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWrite } from './iterate.js';

let tempDir: string | undefined;

describe('iterate atomic writes', () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('does not collide when the same state file is written concurrently', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'sh1pt-iterate-'));
    const file = path.join(tempDir, 'state.json');

    for (let round = 0; round < 20; round += 1) {
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, value) => atomicWrite(file, { round, value })),
      );
      expect(results.filter((result) => result.status === 'rejected')).toEqual([]);
    }
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      round: expect.any(Number),
      value: expect.any(Number),
    });
  });
});
