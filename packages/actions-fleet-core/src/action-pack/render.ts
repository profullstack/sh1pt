import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ActionPackFileSpec, ActionPackManifest } from './schema.js';
import { isSafeTemplateSource } from './validate.js';

export interface RenderInputs {
  [key: string]: string;
}

export interface PlannedFile {
  source: string;
  destination: string;
  mergeStrategy: ActionPackFileSpec['mergeStrategy'];
  content: string;
  hash: string;
}

export interface RenderResult {
  packId: string;
  packVersion: string;
  files: PlannedFile[];
}

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

export class MissingInputError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing required pack inputs: ${missing.join(', ')}`);
    this.name = 'MissingInputError';
    this.missing = missing;
  }
}

// Match {{varName}} but not GitHub Actions expressions ${{ ... }}.
const TAG_RE = /(?<!\$)\{\{([^{}]*)\}\}/g;
const SAFE_VAR_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// A whole-line {{#if varName}} … {{/if}} pair, markers included.
//
// Deliberately the only control construct, and deliberately not nestable: the
// point is to *omit* an optional step rather than leave it in the file behind a
// false `if:` condition. A workflow that ships a disabled Security-tab upload
// still asks a reviewer to read and trust that upload, which is the objection
// this exists to answer — dead surface in a security-sensitive file is surface
// all the same.
//
// Still a bare variable name inside the marker, so the "only {{varName}}"
// guarantee below is unchanged: there is no expression to evaluate, only a
// value to compare against 'true'.
const BLOCK_RE = /^[ \t]*\{\{#if ([^{}]*)\}\}[ \t]*\n([\s\S]*?)^[ \t]*\{\{\/if\}\}[ \t]*\n/gm;

function applyBlocks(template: string, values: Record<string, string>): string {
  return template.replace(BLOCK_RE, (_match, rawExpr: string, body: string) => {
    const expr = rawExpr.trim();
    if (!SAFE_VAR_RE.test(expr)) {
      throw new TemplateRenderError(
        `unsupported template expression "{{#if ${rawExpr}}}" — only {{#if varName}} is allowed`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(values, expr)) {
      throw new TemplateRenderError(`template referenced unknown variable "${expr}"`);
    }
    // Anything other than the literal 'true' drops the block. Pack inputs are
    // strings with a 'true'/'false' enum, and treating a stray value as truthy
    // would turn a typo into a granted write scope.
    return values[expr] === 'true' ? body : '';
  });
}

export function applyTemplate(template: string, values: Record<string, string>): string {
  // Blocks first: a dropped block must not have its {{vars}} resolved, and an
  // unresolvable variable inside a dropped block is not an error.
  return applyBlocks(template, values).replace(TAG_RE, (_match, rawExpr: string) => {
    const expr = rawExpr.trim();
    if (!SAFE_VAR_RE.test(expr)) {
      throw new TemplateRenderError(
        `unsupported template expression "{{${rawExpr}}}" — only {{varName}} substitution is allowed`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(values, expr)) {
      throw new TemplateRenderError(`template referenced unknown variable "${expr}"`);
    }
    const value = values[expr];
    if (value === undefined) {
      throw new TemplateRenderError(`template variable "${expr}" is undefined`);
    }
    return value;
  });
}

export function resolveInputs(
  manifest: ActionPackManifest,
  provided: RenderInputs,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  const unknown = Object.keys(provided).filter((k) => !(k in manifest.inputs));
  if (unknown.length > 0) {
    throw new TemplateRenderError(`unknown pack inputs provided: ${unknown.join(', ')}`);
  }
  for (const [name, def] of Object.entries(manifest.inputs)) {
    const given = provided[name];
    if (given !== undefined) {
      if (def.enum && !def.enum.includes(given)) {
        throw new TemplateRenderError(
          `input "${name}" must be one of [${def.enum.join(', ')}], got "${given}"`,
        );
      }
      resolved[name] = given;
      continue;
    }
    if (def.default !== undefined) {
      resolved[name] = def.default;
      continue;
    }
    if (def.required ?? false) {
      missing.push(name);
      continue;
    }
    resolved[name] = '';
  }
  if (missing.length > 0) throw new MissingInputError(missing);
  return resolved;
}

function normalizeLineEndings(text: string): string {
  const lf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return lf.endsWith('\n') ? lf : `${lf}\n`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function buildManagedHeader(manifest: ActionPackManifest, hash: string): string {
  return [
    '# Managed by sh1pt Actions Fleet',
    `# pack: ${manifest.id}@${manifest.version}`,
    '# install: sh1pt-actions-store',
    `# hash: sha256:${hash}`,
    '',
  ].join('\n');
}

export interface RenderOptions {
  packDir: string;
  manifest: ActionPackManifest;
  inputs: RenderInputs;
  readSource?: (relativeSourcePath: string) => Promise<string>;
}

async function defaultReadSource(packDir: string, relativeSourcePath: string): Promise<string> {
  if (!isSafeTemplateSource(relativeSourcePath)) {
    throw new TemplateRenderError(`unsafe template source path "${relativeSourcePath}"`);
  }
  return readFile(join(packDir, relativeSourcePath), 'utf8');
}

export async function renderPack(options: RenderOptions): Promise<RenderResult> {
  const { manifest, packDir, inputs } = options;
  const read = options.readSource ?? ((p) => defaultReadSource(packDir, p));
  const resolved = resolveInputs(manifest, inputs);

  const planned: PlannedFile[] = [];
  for (const file of manifest.files) {
    const template = await read(file.source);
    const substituted = applyTemplate(template, resolved);
    const body = normalizeLineEndings(substituted);
    const hash = sha256(body);
    const includeManaged = manifest.policies.managedComment && shouldEmbedYamlComment(file.destination);
    const content = includeManaged ? `${buildManagedHeader(manifest, hash)}${body}` : body;
    planned.push({
      source: file.source,
      destination: file.destination,
      mergeStrategy: file.mergeStrategy,
      content,
      hash,
    });
  }

  return { packId: manifest.id, packVersion: manifest.version, files: planned };
}

function shouldEmbedYamlComment(destination: string): boolean {
  return /\.ya?ml$/.test(destination) || destination.endsWith('CODEOWNERS');
}
