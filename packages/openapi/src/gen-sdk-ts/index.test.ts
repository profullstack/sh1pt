import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { generateTsSdk } from './index.js';

const SPEC = {
  openapi: '3.0.0',
  info: { title: 'Petstore', version: '1.0.0' },
  servers: [{ url: 'https://api.petstore.io/v1' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        tags: ['pets'],
        parameters: [{ name: 'page-size', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': { description: 'ok' } },
      },
      post: {
        operationId: 'createPet',
        tags: ['pets'],
        requestBody: { required: true, content: { 'application/json': { schema: {} } } },
        responses: { '201': { description: 'created' } },
      },
    },
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        tags: ['pets'],
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
};

describe('generateTsSdk', () => {
  it('writes a client.ts with one method per operation', async () => {
    const ir = normalize(SPEC);
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-sdk-'));
    const files = await generateTsSdk(ir, { outDir });
    expect(files.map((f) => f.path).sort()).toEqual(['client.ts', 'package.json']);
    const src = await readFile(join(outDir, 'client.ts'), 'utf8');
    expect(src).toContain('class PetstoreClient');
    expect(src).toContain('async listPets(opts: { query?: { _page_size?: number } } = {})');
    expect(src).toContain('query: { "page-size": opts.query?._page_size }');
    expect(src).toContain('async getPet(petId: string)');
    expect(src).toContain('${encodeURIComponent(petId)}');
    expect(src).toContain('async createPet(opts: { body: unknown }):');
    expect(src).toContain('pets = {');
  });
});
