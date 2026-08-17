import { describe, it, expect } from 'vitest';
import {
  applyTemplate,
  renderPack,
  resolveInputs,
  TemplateRenderError,
  MissingInputError,
} from './render.js';
import type { ActionPackManifest } from './schema.js';

function makeManifest(overrides: Partial<ActionPackManifest> = {}): ActionPackManifest {
  return {
    schemaVersion: 1,
    id: 'test-pack',
    name: 'Test Pack',
    description: 'For tests',
    version: '1.0.0',
    publisher: 'sh1pt-tests',
    visibility: 'public',
    license: 'MIT',
    categories: ['ci'],
    compatibility: { providers: ['github'] },
    pricing: { type: 'free' },
    inputs: {
      nodeVersion: { type: 'string', default: '22' },
      testCommand: { type: 'string', default: 'pnpm test' },
    },
    secrets: [],
    repoVariables: [],
    files: [
      { source: 'ci.yml.hbs', destination: '.github/workflows/ci.yml', mergeStrategy: 'replace-managed' },
    ],
    policies: { installMode: 'pull-request', managedComment: true, requiresReview: true },
    security: {
      leastPrivilegePermissions: true,
      pinThirdPartyActions: 'optional',
      allowPullRequestTarget: false,
      defaultTimeoutMinutes: 15,
    },
    ...overrides,
  };
}

describe('applyTemplate', () => {
  it('substitutes simple variables', () => {
    const out = applyTemplate('node: {{nodeVersion}}', { nodeVersion: '22' });
    expect(out).toBe('node: 22');
  });

  it('allows whitespace around variable name', () => {
    const out = applyTemplate('node: {{ nodeVersion }}', { nodeVersion: '22' });
    expect(out).toBe('node: 22');
  });

  it('does not match GitHub Actions ${{ ... }} expressions', () => {
    const tmpl = 'group: ${{ github.workflow }}-${{ github.ref }}';
    const out = applyTemplate(tmpl, {});
    expect(out).toBe(tmpl);
  });

  it('rejects helper-style expressions', () => {
    expect(() => applyTemplate('{{#if foo}}', {})).toThrow(TemplateRenderError);
    expect(() => applyTemplate('{{> partial}}', {})).toThrow(TemplateRenderError);
    expect(() => applyTemplate('{{foo.bar}}', { foo: 'x' })).toThrow(TemplateRenderError);
  });

  it('rejects unknown variables', () => {
    expect(() => applyTemplate('{{missing}}', {})).toThrow(TemplateRenderError);
  });

  it('keeps a {{#if}} block when the variable is exactly "true"', () => {
    const out = applyTemplate('a\n{{#if on}}\nb\n{{/if}}\nc\n', { on: 'true' });
    expect(out).toBe('a\nb\nc\n');
  });

  it('drops a {{#if}} block, and its markers, otherwise', () => {
    for (const value of ['false', '', 'TRUE', 'yes', '1']) {
      const out = applyTemplate('a\n{{#if on}}\nb\n{{/if}}\nc\n', { on: value });
      // Anything but the literal 'true' drops it: pack inputs are strings with
      // a 'true'/'false' enum, and treating a stray value as truthy would turn
      // a typo into a granted write scope.
      expect(out).toBe('a\nc\n');
    }
  });

  it('leaves variables inside a dropped block unresolved rather than erroring', () => {
    // The block is removed before substitution, so a variable that only makes
    // sense when the block is on does not have to be supplied when it is off.
    const out = applyTemplate('a\n{{#if on}}\n{{onlyWhenOn}}\n{{/if}}\nc\n', { on: 'false' });
    expect(out).toBe('a\nc\n');
  });

  it('still substitutes variables inside a kept block', () => {
    const out = applyTemplate('{{#if on}}\nnode: {{nodeVersion}}\n{{/if}}\n', {
      on: 'true',
      nodeVersion: '22',
    });
    expect(out).toBe('node: 22\n');
  });

  it('rejects a {{#if}} on an unknown variable', () => {
    expect(() => applyTemplate('{{#if nope}}\nx\n{{/if}}\n', {})).toThrow(TemplateRenderError);
  });

  it('rejects an unterminated {{#if}}', () => {
    // Falls through to the scalar pass, where "#if on" is not a variable name.
    expect(() => applyTemplate('{{#if on}}\nx\n', { on: 'true' })).toThrow(TemplateRenderError);
  });

  it('does not treat a GitHub expression inside a block as a template tag', () => {
    const out = applyTemplate('{{#if on}}\nrun: ${{ github.sha }}\n{{/if}}\n', { on: 'true' });
    expect(out).toBe('run: ${{ github.sha }}\n');
  });
});

describe('resolveInputs', () => {
  it('applies defaults when input not provided', () => {
    const m = makeManifest();
    const r = resolveInputs(m, {});
    expect(r.nodeVersion).toBe('22');
    expect(r.testCommand).toBe('pnpm test');
  });

  it('lets provided inputs override defaults', () => {
    const m = makeManifest();
    const r = resolveInputs(m, { nodeVersion: '20' });
    expect(r.nodeVersion).toBe('20');
  });

  it('rejects unknown inputs', () => {
    const m = makeManifest();
    expect(() => resolveInputs(m, { madeUp: 'x' })).toThrow(TemplateRenderError);
  });

  it('throws MissingInputError for required inputs without default', () => {
    const m = makeManifest({
      inputs: { mustHave: { type: 'string', required: true } },
    });
    expect(() => resolveInputs(m, {})).toThrow(MissingInputError);
  });

  it('validates enum constraints', () => {
    const m = makeManifest({
      inputs: { mode: { type: 'string', enum: ['a', 'b'], default: 'a' } },
    });
    expect(() => resolveInputs(m, { mode: 'c' })).toThrow(TemplateRenderError);
    expect(resolveInputs(m, { mode: 'b' }).mode).toBe('b');
  });
});

describe('renderPack', () => {
  const tmpl = "node: '{{nodeVersion}}'\ngroup: ci-${{ github.ref }}\nrun: {{testCommand}}";

  async function render(inputs: Record<string, string> = {}, managedComment = true) {
    const m = makeManifest({ policies: { installMode: 'pull-request', managedComment, requiresReview: true } });
    return renderPack({
      packDir: '/fake',
      manifest: m,
      inputs,
      readSource: async () => tmpl,
    });
  }

  it('produces deterministic output for the same inputs', async () => {
    const a = await render({ nodeVersion: '22' });
    const b = await render({ nodeVersion: '22' });
    expect(a.files[0]?.content).toBe(b.files[0]?.content);
    expect(a.files[0]?.hash).toBe(b.files[0]?.hash);
  });

  it('different inputs produce different hashes', async () => {
    const a = await render({ nodeVersion: '22' });
    const b = await render({ nodeVersion: '20' });
    expect(a.files[0]?.hash).not.toBe(b.files[0]?.hash);
  });

  it('embeds managed comment header by default for yaml files', async () => {
    const r = await render({ nodeVersion: '22' });
    const content = r.files[0]?.content ?? '';
    expect(content.startsWith('# Managed by sh1pt Actions Fleet')).toBe(true);
    expect(content).toContain('pack: test-pack@1.0.0');
    expect(content).toMatch(/hash: sha256:[a-f0-9]{64}/);
  });

  it('preserves GitHub Actions expressions in output', async () => {
    const r = await render({ nodeVersion: '22' });
    expect(r.files[0]?.content).toContain('${{ github.ref }}');
  });

  it('omits managed comment when policy is off', async () => {
    const r = await render({ nodeVersion: '22' }, false);
    expect(r.files[0]?.content.startsWith('# Managed by sh1pt Actions Fleet')).toBe(false);
  });

  it('normalizes CRLF to LF', async () => {
    const m = makeManifest();
    const r = await renderPack({
      packDir: '/fake',
      manifest: m,
      inputs: {},
      readSource: async () => "line1\r\nline2\r\n",
    });
    expect(r.files[0]?.content).not.toContain('\r');
  });
});
