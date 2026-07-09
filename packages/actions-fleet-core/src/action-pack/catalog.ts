import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseManifest } from './validate.js';
import type { ActionPackManifest } from './schema.js';

export interface CatalogEntry {
  manifest: ActionPackManifest;
  packDir: string;
}

const MANIFEST_FILENAME = 'sh1pt.actionpack.yaml';

export async function loadCatalog(rootDir: string): Promise<Map<string, CatalogEntry>> {
  const entries = new Map<string, CatalogEntry>();
  const children = await readdirSafe(rootDir);
  for (const child of children) {
    const packDir = join(rootDir, child);
    if (!(await isDirectory(packDir))) continue;
    const manifestPath = join(packDir, MANIFEST_FILENAME);
    if (!(await isFile(manifestPath))) continue;
    const yamlText = await readFile(manifestPath, 'utf8');
    const manifest = parseManifest(yamlText);
    if (entries.has(manifest.id)) {
      throw new Error(`duplicate action-pack id "${manifest.id}" in catalog ${rootDir}`);
    }
    entries.set(manifest.id, { manifest, packDir });
  }
  return entries;
}

export async function loadCatalogEntry(packDir: string): Promise<CatalogEntry> {
  const manifestPath = join(packDir, MANIFEST_FILENAME);
  const yamlText = await readFile(manifestPath, 'utf8');
  const manifest = parseManifest(yamlText);
  return { manifest, packDir };
}

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') return [];
    throw err;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') return false;
    throw err;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch (err: unknown) {
    if (isErrnoException(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return false;
    throw err;
  }
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
