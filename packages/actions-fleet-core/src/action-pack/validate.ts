import { parse as parseYaml } from 'yaml';
import { actionPackManifestSchema, type ActionPackManifest } from './schema.js';

const ALLOWED_DESTINATIONS: RegExp[] = [
  /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/,
  /^\.github\/dependabot\.ya?ml$/,
  /^\.github\/labeler\.ya?ml$/,
  /^\.github\/release-please\.ya?ml$/,
  /^\.github\/release-drafter\.ya?ml$/,
  /^\.github\/CODEOWNERS$/,
  /^docs\/[A-Za-z0-9._/-]+\.(md|mdx)$/,
];

export class ActionPackValidationError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'ActionPackValidationError';
    this.issues = issues;
  }
}

export function isSafeDestination(destination: string): boolean {
  if (destination.length === 0) return false;
  if (destination.startsWith('/')) return false;
  if (destination.includes('\\')) return false;
  if (destination.includes('\0')) return false;
  const segments = destination.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
  }
  return ALLOWED_DESTINATIONS.some((re) => re.test(destination));
}

export function isSafeTemplateSource(source: string): boolean {
  if (source.length === 0) return false;
  if (source.startsWith('/')) return false;
  if (source.includes('\\')) return false;
  if (source.includes('\0')) return false;
  const segments = source.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
  }
  return true;
}

export function validateManifest(raw: unknown): ActionPackManifest {
  const parsed = actionPackManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new ActionPackValidationError(`Invalid action-pack manifest: ${issues.length} issue(s)`, issues);
  }

  const manifest = parsed.data;
  const issues: string[] = [];

  const seenDestinations = new Set<string>();
  for (const [index, file] of manifest.files.entries()) {
    if (!isSafeTemplateSource(file.source)) {
      issues.push(`files[${index}].source: unsafe template path "${file.source}"`);
    }
    if (!isSafeDestination(file.destination)) {
      issues.push(`files[${index}].destination: not an allowed destination "${file.destination}"`);
    }
    if (seenDestinations.has(file.destination)) {
      issues.push(`files[${index}].destination: duplicate destination "${file.destination}"`);
    }
    seenDestinations.add(file.destination);
  }

  if (issues.length > 0) {
    throw new ActionPackValidationError(`Invalid action-pack manifest: ${issues.length} issue(s)`, issues);
  }

  return manifest;
}

export function parseManifest(yamlText: string): ActionPackManifest {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ActionPackValidationError(`YAML parse failed: ${msg}`, [msg]);
  }
  return validateManifest(raw);
}
