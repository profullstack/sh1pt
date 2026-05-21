import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { describe, expect, it } from 'vitest';
import adapter from './index.js';
import { hasHeadlessAuth, qwenArgs, qwenPrompt } from './index.js';

smokeTest(adapter, { idPrefix: 'agent' });

describe('agent-qwen headless helpers', () => {
  it('builds non-interactive qwen args without logging credentials', () => {
    expect(qwenArgs({
      prompt: 'Review the changed files',
      files: ['packages/agents/qwen/src/index.ts', 'README.md'],
    }, {
      authType: 'openai',
      model: 'qwen3-coder-plus',
    })).toEqual([
      '--auth-type',
      'openai',
      '--model',
      'qwen3-coder-plus',
      '-p',
      'Review the changed files\n\nRelevant files:\n@packages/agents/qwen/src/index.ts\n@README.md',
    ]);
  });

  it('leaves prompts unchanged when no file focus is supplied', () => {
    expect(qwenPrompt({ prompt: 'Ship it' })).toBe('Ship it');
  });

  it('checks configured headless auth env keys', () => {
    expect(hasHeadlessAuth({}, { OPENAI_API_KEY: 'sk-test' })).toBe(true);
    expect(hasHeadlessAuth({ authEnvKey: 'CUSTOM_QWEN_KEY' }, { OPENAI_API_KEY: 'sk-test' })).toBe(false);
    expect(hasHeadlessAuth({ authEnvKey: 'CUSTOM_QWEN_KEY' }, { CUSTOM_QWEN_KEY: 'qwen-test' })).toBe(true);
  });
});
