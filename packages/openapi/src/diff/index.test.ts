import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { diffApis, formatDiff } from './index.js';

type Spec = Record<string, any>;

const BASE: Spec = {
  openapi: '3.0.0',
  info: { title: 'Petstore', version: '1.0.0' },
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } },
          '400': { description: 'bad' },
        },
      },
      post: {
        operationId: 'createPet',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPet' } } } },
        responses: { '201': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
      },
    },
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['id', 'name', 'status'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['available', 'sold'] },
          tag: { type: 'string' },
          parent: { $ref: '#/components/schemas/Pet' },
        },
      },
      NewPet: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['available', 'sold'] },
          tag: { type: 'string' },
        },
      },
    },
  },
};

function mutate(fn: (s: Spec) => void): Spec {
  const copy = structuredClone(BASE);
  fn(copy);
  return copy;
}

function codes(head: Spec, level?: string): string[] {
  const d = diffApis(normalize(BASE), normalize(head));
  return d.changes.filter((c) => !level || c.level === level).map((c) => c.code);
}

describe('diffApis', () => {
  it('reports nothing for an identical spec (and survives the recursive Pet schema)', () => {
    const d = diffApis(normalize(BASE), normalize(structuredClone(BASE)));
    expect(d.changes).toEqual([]);
    expect(d.breaking).toBe(0);
  });

  it('flags a removed operation as breaking, a removed deprecated one as a warning', () => {
    expect(codes(mutate((s) => delete s.paths['/pets/{petId}']), 'breaking')).toEqual(['operation-removed']);
    const deprecatedThenRemoved = diffApis(
      normalize(mutate((s) => { s.paths['/pets/{petId}'].get.deprecated = true; })),
      normalize(mutate((s) => delete s.paths['/pets/{petId}'])),
    );
    expect(deprecatedThenRemoved.breaking).toBe(0);
    expect(deprecatedThenRemoved.warnings).toBe(1);
  });

  it('treats added operations and optional fields as non-breaking', () => {
    const head = mutate((s) => {
      s.paths['/owners'] = { get: { operationId: 'listOwners', responses: { '200': { description: 'ok' } } } };
      s.paths['/pets'].get.parameters.push({ name: 'cursor', in: 'query', schema: { type: 'string' } });
      s.components.schemas.Pet.properties.color = { type: 'string' };
      s.components.schemas.NewPet.properties.color = { type: 'string' };
    });
    expect(codes(head, 'breaking')).toEqual([]);
    expect(codes(head)).toEqual(expect.arrayContaining(['operation-added', 'optional-parameter-added', 'property-added']));
  });

  it('does not treat a path parameter rename as a new endpoint', () => {
    const head = mutate((s) => {
      const op = s.paths['/pets/{petId}'];
      op.get.parameters[0].name = 'id';
      s.paths['/pets/{id}'] = op;
      delete s.paths['/pets/{petId}'];
    });
    expect(codes(head)).toEqual(['path-parameter-renamed']);
  });

  it('flags operationId renames because generated SDK and MCP names change', () => {
    expect(codes(mutate((s) => { s.paths['/pets'].get.operationId = 'getPets'; }))).toEqual(['operation-id-changed']);
  });

  it('flags parameters that are added as required, made required, or removed', () => {
    expect(codes(mutate((s) => { s.paths['/pets'].get.parameters[0].required = true; }), 'breaking')).toEqual(['parameter-now-required']);
    expect(codes(mutate((s) => { s.paths['/pets'].get.parameters.push({ name: 'X-Org', in: 'header', required: true }); }), 'breaking'))
      .toEqual(['required-parameter-added']);
    expect(codes(mutate((s) => { s.paths['/pets'].get.parameters = []; }), 'breaking')).toEqual(['parameter-removed']);
  });

  it('judges request schemas strictly: new required field, narrowed enum, changed type', () => {
    expect(codes(mutate((s) => { s.components.schemas.NewPet.required.push('tag'); }), 'breaking')).toEqual(['request-property-now-required']);
    expect(codes(mutate((s) => { s.components.schemas.NewPet.properties.status.enum = ['available']; }), 'breaking'))
      .toEqual(['request-enum-value-removed']);
    expect(codes(mutate((s) => { s.components.schemas.NewPet.properties.name.type = 'integer'; }), 'breaking')).toEqual(['type-changed']);
  });

  it('allows integer -> number on requests but not on responses', () => {
    const head = mutate((s) => { s.paths['/pets'].get.parameters[0].schema.type = 'number'; });
    expect(codes(head)).toEqual([]);
    const resp = mutate((s) => {
      s.components.schemas.Pet.properties.age = { type: 'integer' };
    });
    const resp2 = mutate((s) => {
      s.components.schemas.Pet.properties.age = { type: 'number' };
    });
    expect(diffApis(normalize(resp), normalize(resp2)).breaking).toBeGreaterThan(0);
  });

  it('judges response schemas the other way: removed, optional, or new enum values', () => {
    // Pet is returned by three operations and nested in itself via parent; each is a real break.
    expect(new Set(codes(mutate((s) => { delete s.components.schemas.Pet.properties.tag; }), 'breaking')))
      .toEqual(new Set(['response-property-removed']));
    expect(new Set(codes(mutate((s) => { s.components.schemas.Pet.required = ['id', 'name']; }), 'breaking')))
      .toEqual(new Set(['response-property-now-optional']));
    const enumAdded = mutate((s) => { s.components.schemas.Pet.properties.status.enum.push('pending'); });
    expect(codes(enumAdded, 'breaking')).toEqual([]);
    expect(codes(enumAdded, 'warning')).toContain('response-enum-value-added');
  });

  it('separates losing a success response from losing an error response', () => {
    expect(codes(mutate((s) => { delete s.paths['/pets'].get.responses['400']; }), 'warning')).toEqual(['response-removed']);
    expect(codes(mutate((s) => { delete s.paths['/pets'].get.responses['200']; }), 'breaking')).toEqual(['response-removed']);
  });

  it('formats breaking changes first with a summary line', () => {
    const d = diffApis(normalize(BASE), normalize(mutate((s) => {
      delete s.paths['/pets/{petId}'];
      s.paths['/owners'] = { get: { responses: { '200': { description: 'ok' } } } };
    })));
    const text = formatDiff(d);
    expect(text.split('\n')[0]).toMatch(/^BREAKING GET \/pets\/\{petId\}: operation removed/);
    expect(text).not.toContain('operation-added');
    expect(text).toMatch(/1 breaking, 0 warnings$/);
    expect(formatDiff(d, { includeInfo: true })).toContain('operation-added');
  });
});
