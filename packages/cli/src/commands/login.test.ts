import { describe, expect, it } from 'vitest';
import { browserOpenCommand, loginCmd } from './login.js';

// Regression guard for the `--no-browser` flag.
//
// Commander derives a boolean option named `browser` from `--no-browser` and defaults
// it to `true`. Passing an explicit default of `false` as the third argument overrides
// that, so `opts.browser` resolves to `false` even when the user never passed the flag.
// The action then evaluates `opts.browser !== false` as false and never opens the
// verification URL, which silently disables auto-open for everyone and makes
// `--no-browser` a no-op.
describe('login command --no-browser option', () => {
  it('does not declare an explicit default value', () => {
    const option = loginCmd.options.find((candidate) => candidate.long === '--no-browser');
    expect(option).toBeDefined();
    expect(option?.attributeName()).toBe('browser');
    expect(option?.defaultValue).toBeUndefined();
  });

  it('defaults browser to true when the flag is absent', () => {
    loginCmd.parseOptions([]);
    expect(loginCmd.opts().browser).toBe(true);
  });

  it('sets browser to false when --no-browser is passed', () => {
    loginCmd.parseOptions(['--no-browser']);
    expect(loginCmd.opts().browser).toBe(false);
  });
});

describe('browser open command', () => {
  const url = 'https://sh1pt.com/cli/pair?code=abc&redirect=/done';

  it('passes the complete URL directly to the Windows shell opener', () => {
    expect(browserOpenCommand(url, 'win32')).toEqual({
      command: 'explorer.exe',
      args: [url],
    });
  });

  it('keeps the native macOS and Linux openers', () => {
    expect(browserOpenCommand(url, 'darwin')).toEqual({ command: 'open', args: [url] });
    expect(browserOpenCommand(url, 'linux')).toEqual({ command: 'xdg-open', args: [url] });
  });
});
