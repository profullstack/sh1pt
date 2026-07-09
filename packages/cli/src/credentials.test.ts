import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configDir } from './credentials.js';

const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
const ORIGINAL_HOME = process.env.HOME;

describe('configDir', () => {
  afterEach(() => {
    if (ORIGINAL_XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME;

    if (ORIGINAL_HOME === undefined) delete process.env.HOME;
    else process.env.HOME = ORIGINAL_HOME;
  });

  it('prefers XDG_CONFIG_HOME when set', () => {
    process.env.XDG_CONFIG_HOME = join('tmp', 'xdg');
    process.env.HOME = join('tmp', 'home');

    expect(configDir()).toBe(join('tmp', 'xdg', 'sh1pt'));
  });

  it('falls back to the Node home directory when HOME is not set', () => {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.HOME;

    expect(configDir()).toBe(join(homedir() || '.', '.config', 'sh1pt'));
  });
});
