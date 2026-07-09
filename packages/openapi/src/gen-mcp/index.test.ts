import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { generateMcpServer } from './index.js';

const SPEC = {
  openapi: '3.0.0',
  info: { title: 'Petstore', version: '1.0.0' },
  servers: [{ url: 'https://api.petstore.io/v1' }],
  paths: {
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
};

describe('generateMcpServer', () => {
  it('emits index.js + package.json + README with one tool per op', async () => {
    const ir = normalize(SPEC);
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-mcp-'));
    const files = await generateMcpServer(ir, { outDir });
    expect(files.map((f) => f.path).sort()).toEqual(['README.md', 'index.js', 'package.json']);

    const index = await readFile(join(outDir, 'index.js'), 'utf8');
    expect(index).toContain('name: "getPet"');
    expect(index).toContain('case "getPet":');
    expect(index).toContain('${encodeURIComponent(String(a["petId"]))}');
    expect(index).toContain('@modelcontextprotocol/sdk');

    const pkg = JSON.parse(await readFile(join(outDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeTruthy();
    expect(pkg.bin).toBeDefined();
  });
});
