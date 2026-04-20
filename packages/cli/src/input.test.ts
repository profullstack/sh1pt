import { describe, it, expect } from 'vitest';
import { resolveInput, describeInput } from './input.js';

describe('resolveInput', () => {
  it('detects SSH git urls', () => {
    const r = resolveInput('git@github.com:profullstack/sh1pt.git');
    expect(r.kind).toBe('git');
    expect(r.inferredName).toBe('sh1pt');
  });

  it('detects https github repo urls', () => {
    const r = resolveInput('https://github.com/profullstack/sh1pt');
    expect(r.kind).toBe('git');
    expect(r.inferredName).toBe('sh1pt');
  });

  it('detects gitlab repo urls', () => {
    const r = resolveInput('https://gitlab.com/some-org/some-repo');
    expect(r.kind).toBe('git');
    expect(r.inferredName).toBe('some-repo');
  });

  it('detects bitbucket repo urls', () => {
    const r = resolveInput('https://bitbucket.org/foo/bar');
    expect(r.kind).toBe('git');
  });

  it('detects .git suffixed urls', () => {
    const r = resolveInput('https://example.com/repo.git');
    expect(r.kind).toBe('git');
  });

  it('classifies a bare https URL as a live site', () => {
    const r = resolveInput('https://example.com/pricing');
    expect(r.kind).toBe('url');
    expect(r.inferredName).toBe('example.com');
  });

  it('strips www from inferred hostname', () => {
    const r = resolveInput('https://www.acme.io');
    expect(r.inferredName).toBe('acme.io');
  });

  it('classifies a known doc extension as a doc', () => {
    const r = resolveInput('./plan.md');
    expect(r.kind).toBe('doc');
    expect(r.inferredName).toBe('plan');
  });

  it('classifies a yaml manifest as a doc', () => {
    const r = resolveInput('./sh1pt.yml');
    expect(r.kind).toBe('doc');
    expect(r.inferredName).toBe('sh1pt');
  });

  it('classifies a local path as a path', () => {
    const r = resolveInput('./my-app');
    expect(r.kind).toBe('path');
    expect(r.inferredName).toBe('my-app');
  });

  it('classifies an absolute path as a path', () => {
    const r = resolveInput('/tmp/nonexistent-project-xyz');
    expect(r.kind).toBe('path');
    expect(r.exists).toBe(false);
  });

  it('throws on empty input', () => {
    expect(() => resolveInput('')).toThrow();
    expect(() => resolveInput('   ')).toThrow();
  });

  it('describeInput prefixes with the detected kind', () => {
    expect(describeInput(resolveInput('https://github.com/a/b'))).toContain('[git]');
    expect(describeInput(resolveInput('https://example.com'))).toContain('[url]');
    expect(describeInput(resolveInput('./plan.md'))).toContain('[doc]');
    expect(describeInput(resolveInput('./src'))).toContain('[path]');
  });
});
