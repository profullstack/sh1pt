import { describe, expect, it } from 'vitest';
import { normalize } from './normalize.js';

const PETSTORE = {
  openapi: '3.0.0',
  info: { title: 'Petstore', version: '1.0.0' },
  servers: [{ url: 'https://api.petstore.io/v1' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        tags: ['pets'],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PetList' } } },
          },
        },
      },
      post: {
        operationId: 'createPet',
        tags: ['pets'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
        },
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
  components: {
    schemas: {
      Pet: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      PetList: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
    },
  },
};

describe('normalize', () => {
  it('extracts title/version/servers', () => {
    const ir = normalize(PETSTORE);
    expect(ir.title).toBe('Petstore');
    expect(ir.version).toBe('1.0.0');
    expect(ir.servers).toEqual(['https://api.petstore.io/v1']);
  });

  it('extracts operations with method/path/params', () => {
    const ir = normalize(PETSTORE);
    expect(ir.operations.map((o) => o.id).sort()).toEqual(['createPet', 'getPet', 'listPets']);
    const getPet = ir.operations.find((o) => o.id === 'getPet')!;
    expect(getPet.method).toBe('get');
    expect(getPet.path).toBe('/pets/{petId}');
    expect(getPet.parameters[0]?.in).toBe('path');
    expect(getPet.parameters[0]?.required).toBe(true);
  });

  it('resolves request body schema refs', () => {
    const ir = normalize(PETSTORE);
    const createPet = ir.operations.find((o) => o.id === 'createPet')!;
    expect(createPet.requestBody?.contentType).toBe('application/json');
    expect(createPet.requestBody?.required).toBe(true);
  });

  it('decodes JSON Pointer escapes when resolving refs', () => {
    const ir = normalize({
      openapi: '3.0.0',
      info: { title: 'EscapedRefs', version: '1' },
      paths: {
        '/escaped': {
          get: {
            responses: {
              '200': { $ref: '#/components/responses/Foo~1Bar~0Baz' },
            },
          },
        },
      },
      components: {
        responses: {
          'Foo/Bar~Baz': {
            description: 'escaped ok',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
              },
            },
          },
        },
      },
    });

    expect(ir.operations[0]?.responses[0]?.description).toBe('escaped ok');
    expect(ir.operations[0]?.responses[0]?.contentType).toBe('application/json');
  });

  it('auto-generates operationId when missing', () => {
    const ir = normalize({
      openapi: '3.0.0',
      info: { title: 'X', version: '1' },
      paths: { '/foo/{id}': { delete: { responses: { '204': { description: 'ok' } } } } },
    });
    expect(ir.operations[0]?.id).toBe('deleteFooId');
  });
});
