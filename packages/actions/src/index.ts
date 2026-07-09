import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCatalog, type CatalogEntry } from '@profullstack/sh1pt-actions-fleet-core';

const here = dirname(fileURLToPath(import.meta.url));

// Resolved relative to the published package root. Action product directories
// live directly under packages/actions so sh1pt Cloud can enumerate them.
export const BUILTIN_PACKS_DIR = resolve(here, '..');

export async function loadBuiltinPacks(): Promise<Map<string, CatalogEntry>> {
  return loadCatalog(BUILTIN_PACKS_DIR);
}
