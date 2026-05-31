import { describe, expect, it } from 'vitest';
import { defaultProjectName, initCmd } from './init.js';

describe('initCmd', () => {
  it('is registered as a top-level command named "init"', () => {
    expect(initCmd.name()).toBe('init');
  });

  it('derives a default project name from POSIX paths', () => {
    expect(defaultProjectName('/Users/alice/projects/my-app')).toBe('my-app');
  });

  it('derives a default project name from Windows paths', () => {
    expect(defaultProjectName('C:\\Users\\alice\\projects\\my-app')).toBe('my-app');
  });
});
