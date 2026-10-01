import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

// Loads an OpenAPI spec from a local path or http(s) URL. Format is inferred
// from the trailing extension; YAML and JSON both produce the same raw object.
export async function loadSpec(input: string): Promise<Record<string, unknown>> {
  return parseSpec(await readText(input), input);
}

// loadSpec, plus <git-ref>:<path> (origin/main:openapi.yaml) read with
// `git show`, so CI can diff against the base branch without a second
// checkout. A file or URL always wins over the ref reading.
export async function loadSpecRef(input: string): Promise<Record<string, unknown>> {
  if (/^https?:\/\//i.test(input) || existsSync(input)) return loadSpec(input);
  const m = /^([^:]+):(.+)$/.exec(input);
  if (!m?.[1] || !m[2]) throw new Error(`openapi: ${input} is not a file, URL, or <git-ref>:<path>`);
  let text: string;
  try {
    text = execFileSync('git', ['show', `${m[1]}:${m[2]}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new Error(`openapi: git show ${m[1]}:${m[2]} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return parseSpec(text, m[2]);
}

// Parses spec text already in hand (from `git show`, stdin, a test). `name`
// is only used to pick YAML vs JSON by its extension.
export function parseSpec(text: string, name = ''): Record<string, unknown> {
  const isYaml = /\.ya?ml($|\?)/i.test(name);
  if (isYaml) return parseYaml(text) as Record<string, unknown>;
  // Default to JSON; fall back to YAML so .txt / no-extension URLs still work.
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return parseYaml(text) as Record<string, unknown>;
  }
}

async function readText(input: string): Promise<string> {
  if (/^https?:\/\//i.test(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`openapi: fetch ${input} failed: ${res.status}`);
    return res.text();
  }
  return readFile(input, 'utf8');
}
