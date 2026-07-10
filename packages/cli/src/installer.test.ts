import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { globalNodeModulesDir } from './installer.js';

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

describe('globalNodeModulesDir', () => {
  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env.HOME;
    else process.env.HOME = ORIGINAL_HOME;

    if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  });

  it('uses USERPROFILE for global package paths when HOME is not set', () => {
    delete process.env.HOME;
    process.env.USERPROFILE = join('tmp', 'windows-home');

    expect(globalNodeModulesDir('bun')).toBe(join('tmp', 'windows-home', '.bun/install/global/node_modules'));
    expect(globalNodeModulesDir('aube')).toBe(join('tmp', 'windows-home', '.aube/install/global/node_modules'));
  });
});
