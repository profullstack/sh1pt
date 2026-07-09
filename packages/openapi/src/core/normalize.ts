import type {
  ApiIR,
  HttpMethod,
  Operation,
  Parameter,
  RequestBody,
  Response,
  SecurityScheme,
} from './types.js';

const METHODS: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

// Walks a parsed OpenAPI 3.x document and produces our internal IR.
// $ref resolution is intentionally shallow: we only resolve refs that point
// inside the same document under #/components/*. External refs are left as-is
// for generators to either error on or follow themselves.
export function normalize(raw: Record<string, unknown>): ApiIR {
  const info = (raw.info ?? {}) as Record<string, unknown>;
  const servers = Array.isArray(raw.servers)
    ? (raw.servers as Array<{ url?: string }>).map((s) => s.url).filter((u): u is string => !!u)
    : [];

  const components = (raw.components ?? {}) as Record<string, unknown>;
  const schemas = (components.schemas ?? {}) as Record<string, unknown>;
  const securitySchemes = (components.securitySchemes ?? {}) as Record<string, Record<string, unknown>>;

  const paths = (raw.paths ?? {}) as Record<string, Record<string, unknown>>;
  const operations: Operation[] = [];

  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    const pathLevelParams = (item.parameters ?? []) as unknown[];
    for (const method of METHODS) {
      const op = item[method] as Record<string, unknown> | undefined;
      if (!op) continue;
      operations.push(toOperation(path, method, op, pathLevelParams, raw));
    }
  }

  return {
    title: typeof info.title === 'string' ? info.title : 'API',
    version: typeof info.version === 'string' ? info.version : '0.0.0',
    description: typeof info.description === 'string' ? info.description : undefined,
    servers,
    operations,
    schemas,
    security: toSecuritySchemes(securitySchemes),
  };
}

function toOperation(
  path: string,
  method: HttpMethod,
  op: Record<string, unknown>,
  pathLevelParams: unknown[],
  root: Record<string, unknown>,
): Operation {
  const opParams = (op.parameters ?? []) as unknown[];
  const rawParams = [...pathLevelParams, ...opParams];
  const parameters = rawParams
    .map((p) => resolveRef(p, root) as Record<string, unknown> | undefined)
    .filter((p): p is Record<string, unknown> => !!p)
    .map(toParameter);

  return {
    id: typeof op.operationId === 'string' ? op.operationId : autoId(method, path),
    method,
    path,
    summary: typeof op.summary === 'string' ? op.summary : undefined,
    description: typeof op.description === 'string' ? op.description : undefined,
    tags: Array.isArray(op.tags) ? (op.tags as string[]) : [],
    parameters,
    requestBody: toRequestBody(op.requestBody, root),
    responses: toResponses(op.responses, root),
    deprecated: op.deprecated === true,
  };
}

function toParameter(p: Record<string, unknown>): Parameter {
  return {
    name: String(p.name ?? ''),
    in: (p.in as Parameter['in']) ?? 'query',
    required: p.required === true,
    description: typeof p.description === 'string' ? p.description : undefined,
    schema: p.schema,
  };
}

function toRequestBody(rb: unknown, root: Record<string, unknown>): RequestBody | undefined {
  const resolved = resolveRef(rb, root) as Record<string, unknown> | undefined;
  if (!resolved) return undefined;
  const content = (resolved.content ?? {}) as Record<string, { schema?: unknown }>;
  const [contentType, media] = Object.entries(content)[0] ?? [];
  if (!contentType) return undefined;
  return {
    contentType,
    required: resolved.required === true,
    schema: media?.schema,
  };
}

function toResponses(rs: unknown, root: Record<string, unknown>): Response[] {
  if (!rs || typeof rs !== 'object') return [];
  return Object.entries(rs as Record<string, unknown>).map(([status, body]) => {
    const resolved = (resolveRef(body, root) ?? {}) as Record<string, unknown>;
    const content = (resolved.content ?? {}) as Record<string, { schema?: unknown }>;
    const [contentType, media] = Object.entries(content)[0] ?? [];
    return {
      status,
      description: typeof resolved.description === 'string' ? resolved.description : undefined,
      contentType,
      schema: media?.schema,
    };
  });
}

function toSecuritySchemes(schemes: Record<string, Record<string, unknown>>): SecurityScheme[] {
  return Object.entries(schemes).map(([id, s]) => ({
    id,
    type: s.type as SecurityScheme['type'],
    scheme: typeof s.scheme === 'string' ? s.scheme : undefined,
    bearerFormat: typeof s.bearerFormat === 'string' ? s.bearerFormat : undefined,
    in: s.in as SecurityScheme['in'],
    name: typeof s.name === 'string' ? s.name : undefined,
  }));
}

// Resolve a single in-document $ref ("#/components/x/y"). One hop only; nested
// refs are left for the generator to follow if it needs them.
function resolveRef(node: unknown, root: Record<string, unknown>): unknown {
  if (!node || typeof node !== 'object') return node;
  const ref = (node as Record<string, unknown>).$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return node;
  const parts = ref.slice(2).split('/');
  let cur: unknown = root;
  for (const p of parts) {
    const key = p.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[key];
    else return undefined;
  }
  return cur;
}

function autoId(method: HttpMethod, path: string): string {
  // /pets/{petId}/upload -> getPetsPetIdUpload
  const segs = path
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/[{}]/g, ''))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[^a-zA-Z0-9]/g, ''));
  return method + segs.join('');
}
