import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

// Loads an OpenAPI spec from a local path or http(s) URL. Format is inferred
// from the trailing extension; YAML and JSON both produce the same raw object.
export async function loadSpec(input: string): Promise<Record<string, unknown>> {
  const text = await readText(input);
  const isYaml = /\.ya?ml($|\?)/i.test(input);
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
