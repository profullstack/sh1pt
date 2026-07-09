import { describe, it, expect } from 'vitest';
import { actionPackManifestSchema } from './schema.js';
import {
  parseManifest,
  validateManifest,
  isSafeDestination,
  isSafeTemplateSource,
  ActionPackValidationError,
} from './validate.js';

const validManifest = {
  schemaVersion: 1,
  id: 'node-pnpm-ci',
  name: 'Node pnpm CI',
  description: 'Test pack',
  version: '1.0.0',
  publisher: 'profullstack',
  visibility: 'public',
  license: 'MIT',
  categories: ['ci', 'node'],
  compatibility: { providers: ['github'] },
  pricing: { type: 'free' },
  files: [
    { source: 'workflows/ci.yml.hbs', destination: '.github/workflows/ci.yml', mergeStrategy: 'replace-managed' },
  ],
  policies: { installMode: 'pull-request', managedComment: true, requiresReview: true },
  security: {
    leastPrivilegePermissions: true,
    pinThirdPartyActions: 'optional',
    allowPullRequestTarget: false,
    defaultTimeoutMinutes: 15,
  },
};

describe('actionPackManifestSchema', () => {
  it('accepts a minimal valid manifest', () => {
    const result = actionPackManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it('rejects non-kebab-case ids', () => {
    const bad = { ...validManifest, id: 'NodePnpmCI' };
    expect(actionPackManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects ids with leading digit', () => {
    const bad = { ...validManifest, id: '1node-ci' };
    expect(actionPackManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-semver versions', () => {
    const bad = { ...validManifest, version: '1.0' };
    expect(actionPackManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown top-level fields', () => {
    const bad = { ...validManifest, extra: 'nope' };
    expect(actionPackManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty files array', () => {
    const bad = { ...validManifest, files: [] };
    expect(actionPackManifestSchema.safeParse(bad).success).toBe(false);
  });
});

describe('validateManifest path safety', () => {
  it('rejects path traversal in destination', () => {
    const bad = {
      ...validManifest,
      files: [
        { source: 'a.hbs', destination: '../etc/passwd', mergeStrategy: 'replace-managed' as const },
      ],
    };
    expect(() => validateManifest(bad)).toThrow(ActionPackValidationError);
  });

  it('rejects absolute destination', () => {
    const bad = {
      ...validManifest,
      files: [
        { source: 'a.hbs', destination: '/etc/passwd', mergeStrategy: 'replace-managed' as const },
      ],
    };
    expect(() => validateManifest(bad)).toThrow(ActionPackValidationError);
  });

  it('rejects destination outside whitelist', () => {
    const bad = {
      ...validManifest,
      files: [
        { source: 'a.hbs', destination: 'src/index.ts', mergeStrategy: 'replace-managed' as const },
      ],
    };
    expect(() => validateManifest(bad)).toThrow(ActionPackValidationError);
  });

  it('rejects duplicate destinations', () => {
    const bad = {
      ...validManifest,
      files: [
        { source: 'a.hbs', destination: '.github/workflows/ci.yml', mergeStrategy: 'replace-managed' as const },
        { source: 'b.hbs', destination: '.github/workflows/ci.yml', mergeStrategy: 'replace-managed' as const },
      ],
    };
    expect(() => validateManifest(bad)).toThrow(ActionPackValidationError);
  });

  it('rejects template source containing ..', () => {
    const bad = {
      ...validManifest,
      files: [
        { source: '../escape.hbs', destination: '.github/workflows/ci.yml', mergeStrategy: 'replace-managed' as const },
      ],
    };
    expect(() => validateManifest(bad)).toThrow(ActionPackValidationError);
  });

  it('rejects Windows-style template source traversal', () => {
    const bad = {
      ...validManifest,
      files: [
        {
          source: 'templates\\..\\escape.hbs',
          destination: '.github/workflows/ci.yml',
          mergeStrategy: 'replace-managed' as const,
        },
      ],
    };
    expect(() => validateManifest(bad)).toThrow(ActionPackValidationError);
    expect(isSafeTemplateSource('templates\\..\\escape.hbs')).toBe(false);
  });

  it('allows workflow files, dependabot, codeowners', () => {
    expect(isSafeDestination('.github/workflows/ci.yml')).toBe(true);
    expect(isSafeDestination('.github/workflows/release.yaml')).toBe(true);
    expect(isSafeDestination('.github/dependabot.yml')).toBe(true);
    expect(isSafeDestination('.github/CODEOWNERS')).toBe(true);
    expect(isSafeDestination('docs/setup.md')).toBe(true);
  });

  it('rejects sneaky destinations', () => {
    expect(isSafeDestination('.github/workflows/../../etc/passwd')).toBe(false);
    expect(isSafeDestination('.github/workflows/')).toBe(false);
    expect(isSafeDestination('.github/workflows/ci.txt')).toBe(false);
    expect(isSafeDestination('.github\\workflows\\ci.yml')).toBe(false);
    expect(isSafeDestination('')).toBe(false);
    expect(isSafeDestination('.github/workflows/ci.yml\0.bad')).toBe(false);
  });
});

describe('parseManifest', () => {
  it('parses a YAML manifest', () => {
    const yaml = `
schemaVersion: 1
id: example-ci
name: Example
description: Test
version: 0.1.0
publisher: example
visibility: public
license: MIT
categories: [ci]
compatibility:
  providers: [github]
pricing:
  type: free
files:
  - source: workflows/ci.yml.hbs
    destination: .github/workflows/ci.yml
    mergeStrategy: replace-managed
policies:
  installMode: pull-request
  managedComment: true
  requiresReview: true
security:
  leastPrivilegePermissions: true
  pinThirdPartyActions: optional
  allowPullRequestTarget: false
  defaultTimeoutMinutes: 15
`;
    const m = parseManifest(yaml);
    expect(m.id).toBe('example-ci');
    expect(m.files[0]?.destination).toBe('.github/workflows/ci.yml');
  });

  it('throws on malformed YAML', () => {
    expect(() => parseManifest(': : : invalid')).toThrow(ActionPackValidationError);
  });
});
