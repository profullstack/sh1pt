// Internal IR — a pragmatic subset of OpenAPI 3.x. Enough to render a usable
// client, MCP server, or docs site for typical CRUD specs. We deliberately
// keep JSON Schema as a pass-through `unknown` to avoid reimplementing it;
// generators that need richer typing can walk it themselves.

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options';

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema?: unknown;
}

export interface RequestBody {
  contentType: string;
  required: boolean;
  schema?: unknown;
}

export interface Response {
  status: string;
  description?: string;
  contentType?: string;
  schema?: unknown;
}

export interface Operation {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Response[];
  deprecated: boolean;
}

export interface SecurityScheme {
  id: string;
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  bearerFormat?: string;
  in?: 'header' | 'query' | 'cookie';
  name?: string;
}

export interface ApiIR {
  title: string;
  version: string;
  description?: string;
  servers: string[];
  operations: Operation[];
  schemas: Record<string, unknown>;
  security: SecurityScheme[];
}
