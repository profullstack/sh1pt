import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { manifestSchema, type Manifest, type TargetSpec } from '@profullstack/sh1pt-core';

export const CONFIG_FILENAMES = [
  'sh1pt.config.ts',
  'sh1pt.config.mts',
  'sh1pt.config.js',
  'sh1pt.config.mjs',
  'sh1pt.config.cjs',
  'sh1pt.config.json',
];

export interface LoadedManifest {
  manifest: Manifest;
  path: string;
}

export interface ResolvedTarget {
  id: string;
  spec: TargetSpec;
}

export async function findManifestPath(projectDir = process.cwd()): Promise<string | null> {
  for (const name of CONFIG_FILENAMES) {
    const candidate = resolve(projectDir, name);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

export async function loadManifest(projectDir = process.cwd()): Promise<LoadedManifest> {
  const path = await findManifestPath(projectDir);
  if (!path) {
    throw new Error(`No sh1pt config found in ${projectDir}. Run sh1pt promote ship init first.`);
  }

  const raw = path.endsWith('.json')
    ? JSON.parse(await readFile(path, 'utf8'))
    : await import(pathToFileURL(path).href + `?t=${Date.now()}`).then((mod) => mod.default ?? mod.config ?? mod.manifest);

  return { manifest: manifestSchema.parse(raw), path };
}

export function resolveTargets(manifest: Manifest, requested?: string[]): ResolvedTarget[] {
  const entries = Object.entries(manifest.targets ?? {}).filter(([, spec]) => spec.enabled !== false);
  const selected = requested?.length
    ? entries.filter(([id]) => requested.includes(id))
    : entries;

  if (requested?.length) {
    const known = new Set(entries.map(([id]) => id));
    const missing = requested.filter((id) => !known.has(id));
    if (missing.length) {
      throw new Error(`Unknown or disabled target(s): ${missing.join(', ')}`);
    }
  }

  return selected.map(([id, spec]) => ({ id, spec }));
}
