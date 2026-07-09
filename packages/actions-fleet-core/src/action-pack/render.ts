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

export function applyTemplate(template: string, values: Record<string, string>): string {
  return template.replace(TAG_RE, (_match, rawExpr: string) => {
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
