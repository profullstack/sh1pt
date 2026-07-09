import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { generateDocsSite } from './index.js';

const SPEC = {
  openapi: '3.0.0',
  info: { title: 'Petstore', version: '1.0.0', description: 'A simple pet store.' },
  servers: [{ url: 'https://api.petstore.io/v1' }],
  paths: {
    '/pets': {
      get: { operationId: 'listPets', tags: ['pets'], summary: 'List pets', responses: { '200': { description: 'ok' } } },
    },
    '/admin/tools': {
      get: { operationId: 'listAdminTools', tags: ['Admin/Tools'], summary: 'List admin tools', responses: { '200': { description: 'ok' } } },
    },
  },
};

describe('generateDocsSite', () => {
  it('emits an overview, sidebar.json, and one md per operation', async () => {
    const ir = normalize(SPEC);
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-docs-'));
    const files = await generateDocsSite(ir, { outDir });
    const paths = files.map((f) => f.path).sort();
    expect(paths).toContain('index.md');
    expect(paths).toContain('sidebar.json');
    expect(paths).toContain('admin-tools/listadmintools.md');
    expect(paths).toContain('pets/listpets.md');

    const overview = await readFile(join(outDir, 'index.md'), 'utf8');
    expect(overview).toContain('# Petstore');
    expect(overview).toContain('https://api.petstore.io/v1');
    expect(overview).toContain('[`GET /pets`]');
    expect(overview).toContain('./admin-tools/listadmintools.md');

    const sidebar = JSON.parse(await readFile(join(outDir, 'sidebar.json'), 'utf8'));
    expect(sidebar.groups[0].label).toBe('pets');
    expect(sidebar.groups[0].pages[0].method).toBe('GET');
    expect(sidebar.groups[1].label).toBe('Admin/Tools');
    expect(sidebar.groups[1].pages[0].href).toBe('admin-tools/listadmintools.md');
  });
});
