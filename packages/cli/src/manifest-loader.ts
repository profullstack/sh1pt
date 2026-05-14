import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { manifestSchema, type Manifest } from '@profullstack/sh1pt-core';

const CONFIG_FILES = [
  'sh1pt.config.mjs',
  'sh1pt.config.js',
  'sh1pt.config.ts',
  'sh1pt.config.json',
];

export interface LoadedManifest {
  manifest: Manifest;
  configPath: string;
  projectDir: string;
}

export async function loadManifestFromProject(projectDir: string): Promise<LoadedManifest> {
  const configPath = findConfig(projectDir);
  if (!configPath) {
    throw new Error(`No sh1pt config found in ${projectDir}`);
  }

  const raw = await loadConfigModule(configPath);
  const manifest = manifestSchema.parse(raw);
  return {
    manifest,
    configPath,
    projectDir: dirname(configPath),
  };
}

function findConfig(projectDir: string): string | undefined {
  for (const name of CONFIG_FILES) {
    const candidate = join(projectDir, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function loadConfigModule(configPath: string): Promise<unknown> {
  if (configPath.endsWith('.json')) {
    return JSON.parse(await readFile(configPath, 'utf8')) as unknown;
  }

  try {
    const url = pathToFileURL(configPath);
    url.searchParams.set('t', String(Date.now()));
    const mod = await import(url.href);
    return 'default' in mod ? mod.default : mod;
  } catch (err) {
    if (!configPath.endsWith('.ts')) throw err;
    return loadSimpleTsConfig(configPath);
  }
}

async function loadSimpleTsConfig(configPath: string): Promise<unknown> {
  const source = await readFile(configPath, 'utf8');
  const withoutDefineConfigImport = source.replace(
    /^\s*import\s+\{\s*defineConfig\s*\}\s+from\s+['"]@profullstack\/sh1pt-core['"];?\s*/m,
    '',
  );
  const runnable = withoutDefineConfigImport.replace(/\bexport\s+default\s+/, 'return ');

  if (runnable === withoutDefineConfigImport) {
    throw new Error(`Could not load ${configPath}: expected an export default config`);
  }

  const evaluate = new Function('defineConfig', runnable);
  return evaluate((manifest: unknown) => manifest) as unknown;
}
