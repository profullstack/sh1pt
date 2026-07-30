import { describe, expect, it } from 'vitest';
import { parseGithubRepoId } from './github-repo-id';

describe('parseGithubRepoId', () => {
  it('parses a positive safe integer', () => {
    expect(parseGithubRepoId('123456789')).toBe(123456789);
  });

  it.each(['123abc', '123.5', '-123', '0', '', ' 123', '9007199254740992'])(
    'rejects invalid repo id %j',
    (value) => {
      expect(parseGithubRepoId(value)).toBeNull();
    },
  );
});
