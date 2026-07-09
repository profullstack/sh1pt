import { describe, expect, it } from 'vitest';
import { CONFIG_TEMPLATE } from './init.js';

describe('CONFIG_TEMPLATE', () => {
  it('escapes project names before writing them into TypeScript config', () => {
    const config = CONFIG_TEMPLATE("Ahmed's App");

    expect(config).toContain('name: "Ahmed\'s App"');
    expect(config).not.toContain("name: 'Ahmed's App'");
  });

  it('escapes control characters in project names', () => {
    const config = CONFIG_TEMPLATE('line\nbreak');

    expect(config).toContain('name: "line\\nbreak"');
  });

  it('escapes double quotes and backslashes in project names', () => {
    const name = 'quote "inside" C:\\tmp\\app';
    const config = CONFIG_TEMPLATE(name);

    expect(config).toContain(`name: ${JSON.stringify(name)}`);
  });
});
