import type { ApiIR, Operation, Parameter } from '../core/types.js';

// Contract diff between two versions of the same API, judged from the side of
// a client built against `base` (a generated SDK, an MCP server, a CLI). The
// question every rule answers is: does a caller that worked yesterday still
// work after `head` ships? This is the OpenAPI counterpart of `buf breaking`.
//
// Request and response schemas are judged in opposite directions. A request
// may not demand more than before (new required field, narrower enum, changed
// type); a response may not promise less (removed field, field no longer
// required, changed type). Widening either way is fine.

export type ChangeLevel = 'breaking' | 'warning' | 'info';

export interface ApiChange {
  level: ChangeLevel;
  code: string;
  // "GET /pets/{id}", or "" for API-wide changes.
  operation: string;
  // Dotted location inside the operation: "query.limit", "body.owner.name", "200.items[]".
  location?: string;
  message: string;
}

export interface ApiDiff {
  changes: ApiChange[];
  breaking: number;
  warnings: number;
}

export function diffApis(base: ApiIR, head: ApiIR): ApiDiff {
  const changes: ApiChange[] = [];
  const baseOps = indexOperations(base.operations);
  const headOps = indexOperations(head.operations);

  for (const [key, b] of baseOps) {
    const h = headOps.get(key);
    const label = opLabel(b);
    if (!h) {
      changes.push({
        level: b.deprecated ? 'warning' : 'breaking',
        code: 'operation-removed',
        operation: label,
        message: b.deprecated ? 'deprecated operation removed' : 'operation removed',
      });
      continue;
    }
    const ctx: Ctx = { base, head, operation: label, changes };
    diffOperation(ctx, b, h);
  }

  for (const [key, h] of headOps) {
    if (!baseOps.has(key)) {
      changes.push({ level: 'info', code: 'operation-added', operation: opLabel(h), message: 'operation added' });
    }
  }

  return {
    changes,
    breaking: changes.filter((c) => c.level === 'breaking').length,
    warnings: changes.filter((c) => c.level === 'warning').length,
  };
}

interface Ctx {
  base: ApiIR;
  head: ApiIR;
  operation: string;
  changes: ApiChange[];
}

function push(ctx: Ctx, level: ChangeLevel, code: string, location: string | undefined, message: string): void {
  ctx.changes.push({ level, code, operation: ctx.operation, location, message });
}

// Path templates are keyed with parameter names blanked out: /pets/{id} and
// /pets/{petId} are the same endpoint on the wire.
function indexOperations(ops: Operation[]): Map<string, Operation> {
  const out = new Map<string, Operation>();
  for (const op of ops) out.set(`${op.method} ${op.path.replace(/\{[^}]*\}/g, '{}')}`, op);
  return out;
}

function opLabel(op: Operation): string {
  return `${op.method.toUpperCase()} ${op.path}`;
}

function diffOperation(ctx: Ctx, b: Operation, h: Operation): void {
  // Generated SDK methods and MCP tool names come from operationId, so a
  // rename breaks every generated client even though the HTTP call is the same.
  if (b.id !== h.id) {
    push(ctx, 'breaking', 'operation-id-changed', undefined, `operationId changed: ${b.id} -> ${h.id}`);
  }
  if (!b.deprecated && h.deprecated) {
    push(ctx, 'info', 'operation-deprecated', undefined, 'operation deprecated');
  }

  diffParameters(ctx, b, h);
  diffRequestBody(ctx, b, h);
  diffResponses(ctx, b, h);
}

function diffParameters(ctx: Ctx, b: Operation, h: Operation): void {
  const key = (p: Parameter, op: Operation) =>
    p.in === 'path' ? `path#${pathParamIndex(op.path, p.name)}` : `${p.in}.${p.in === 'header' ? p.name.toLowerCase() : p.name}`;
  const baseParams = new Map(b.parameters.map((p) => [key(p, b), p]));
  const headParams = new Map(h.parameters.map((p) => [key(p, h), p]));

  for (const [k, bp] of baseParams) {
    const hp = headParams.get(k);
    const loc = `${bp.in}.${bp.name}`;
    if (!hp) {
      // A dropped optional query param is usually ignored by the server, but
      // generated SDKs lose the argument, so it still breaks compiled callers.
      push(ctx, 'breaking', 'parameter-removed', loc, `${bp.in} parameter "${bp.name}" removed`);
      continue;
    }
    if (bp.in === 'path' && bp.name !== hp.name) {
      push(ctx, 'info', 'path-parameter-renamed', loc, `path parameter renamed: ${bp.name} -> ${hp.name}`);
    }
    if (!bp.required && hp.required) {
      push(ctx, 'breaking', 'parameter-now-required', loc, `${bp.in} parameter "${bp.name}" became required`);
    }
    diffSchema(ctx, 'request', loc, bp.schema, hp.schema, new Set());
  }

  for (const [k, hp] of headParams) {
    if (baseParams.has(k)) continue;
    const loc = `${hp.in}.${hp.name}`;
    if (hp.required) {
      push(ctx, 'breaking', 'required-parameter-added', loc, `required ${hp.in} parameter "${hp.name}" added`);
    } else {
      push(ctx, 'info', 'optional-parameter-added', loc, `optional ${hp.in} parameter "${hp.name}" added`);
    }
  }
}

function pathParamIndex(path: string, name: string): number {
  const names = [...path.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
  const i = names.indexOf(name);
  return i === -1 ? names.length : i;
}

function diffRequestBody(ctx: Ctx, b: Operation, h: Operation): void {
  const bb = b.requestBody;
  const hb = h.requestBody;
  if (!bb && !hb) return;
  if (!bb && hb) {
    push(ctx, hb.required ? 'breaking' : 'info', 'request-body-added', 'body',
      hb.required ? 'required request body added' : 'optional request body added');
    return;
  }
  if (bb && !hb) {
    push(ctx, 'breaking', 'request-body-removed', 'body', 'request body removed');
    return;
  }
  if (!bb || !hb) return;
  if (!bb.required && hb.required) {
    push(ctx, 'breaking', 'request-body-now-required', 'body', 'request body became required');
  }
  if (bb.contentType !== hb.contentType) {
    push(ctx, 'breaking', 'request-content-type-changed', 'body',
      `request content type changed: ${bb.contentType} -> ${hb.contentType}`);
  }
  diffSchema(ctx, 'request', 'body', bb.schema, hb.schema, new Set());
}

function diffResponses(ctx: Ctx, b: Operation, h: Operation): void {
  const headByStatus = new Map(h.responses.map((r) => [r.status, r]));
  for (const br of b.responses) {
    const hr = headByStatus.get(br.status);
    const success = /^2/.test(br.status);
    if (!hr) {
      // Losing a documented error code is a softer change than losing the
      // success shape: clients usually branch on the class, not the number.
      push(ctx, success ? 'breaking' : 'warning', 'response-removed', br.status, `response ${br.status} removed`);
      continue;
    }
    if (br.contentType && hr.contentType && br.contentType !== hr.contentType) {
      push(ctx, 'breaking', 'response-content-type-changed', br.status,
        `response content type changed: ${br.contentType} -> ${hr.contentType}`);
    }
    diffSchema(ctx, 'response', br.status, br.schema, hr.schema, new Set());
  }
  for (const hr of h.responses) {
    if (!b.responses.some((r) => r.status === hr.status) && /^2/.test(hr.status) && b.responses.some((r) => /^2/.test(r.status))) {
      push(ctx, 'warning', 'success-response-added', hr.status, `new success status ${hr.status}; clients may only handle the old one`);
    }
  }
}

type Direction = 'request' | 'response';
type Schema = Record<string, unknown>;

// Walks two JSON Schemas in step. `seen` guards recursive component schemas
// (a Node with children: Node[]) so the walk terminates.
function diffSchema(
  ctx: Ctx,
  dir: Direction,
  loc: string,
  rawBase: unknown,
  rawHead: unknown,
  seen: Set<string>,
): void {
  if (rawBase === undefined || rawHead === undefined) return;
  const guard = refPair(rawBase, rawHead);
  if (guard) {
    if (seen.has(guard)) return;
    seen = new Set(seen).add(guard);
  }
  const b = deref(rawBase, ctx.base);
  const h = deref(rawHead, ctx.head);
  if (!b || !h) return;

  const bt = typeOf(b);
  const ht = typeOf(h);
  if (bt && ht && bt !== ht && !widens(dir, bt, ht)) {
    push(ctx, 'breaking', 'type-changed', loc, `type changed: ${bt} -> ${ht}`);
    return;
  }

  diffEnum(ctx, dir, loc, b, h);

  if (dir === 'request' && b.nullable === true && h.nullable !== true) {
    push(ctx, 'breaking', 'no-longer-nullable', loc, 'no longer accepts null');
  }
  if (dir === 'response' && b.nullable !== true && h.nullable === true) {
    push(ctx, 'breaking', 'now-nullable', loc, 'may now be null');
  }

  const bProps = (b.properties ?? {}) as Record<string, unknown>;
  const hProps = (h.properties ?? {}) as Record<string, unknown>;
  const bReq = new Set(Array.isArray(b.required) ? (b.required as string[]) : []);
  const hReq = new Set(Array.isArray(h.required) ? (h.required as string[]) : []);

  for (const name of Object.keys(bProps)) {
    const at = `${loc}.${name}`;
    if (!(name in hProps)) {
      if (dir === 'response') {
        push(ctx, 'breaking', 'response-property-removed', at, `property "${name}" removed from response`);
      } else if (bReq.has(name)) {
        // Clients still send it; a strict server (additionalProperties: false) now rejects them.
        push(ctx, h.additionalProperties === false ? 'breaking' : 'warning', 'request-property-removed', at,
          `required property "${name}" removed from request`);
      } else {
        push(ctx, h.additionalProperties === false ? 'breaking' : 'info', 'request-property-removed', at,
          `property "${name}" removed from request`);
      }
      continue;
    }
    diffSchema(ctx, dir, at, bProps[name], hProps[name], seen);
  }

  for (const name of hReq) {
    if (bReq.has(name)) continue;
    const at = `${loc}.${name}`;
    if (dir === 'request') {
      push(ctx, 'breaking', 'request-property-now-required', at,
        name in bProps ? `property "${name}" became required` : `required property "${name}" added`);
    }
  }
  if (dir === 'response') {
    for (const name of bReq) {
      if (!hReq.has(name) && name in hProps) {
        push(ctx, 'breaking', 'response-property-now-optional', `${loc}.${name}`,
          `property "${name}" is no longer guaranteed in the response`);
      }
    }
  }
  for (const name of Object.keys(hProps)) {
    if (!(name in bProps) && !hReq.has(name)) {
      push(ctx, 'info', 'property-added', `${loc}.${name}`, `optional property "${name}" added`);
    }
  }

  if (b.items !== undefined && h.items !== undefined) {
    diffSchema(ctx, dir, `${loc}[]`, b.items, h.items, seen);
  }
}

function diffEnum(ctx: Ctx, dir: Direction, loc: string, b: Schema, h: Schema): void {
  const be = Array.isArray(b.enum) ? (b.enum as unknown[]) : undefined;
  const he = Array.isArray(h.enum) ? (h.enum as unknown[]) : undefined;
  if (!be && !he) return;
  const has = (list: unknown[] | undefined, v: unknown) => !list || list.some((x) => JSON.stringify(x) === JSON.stringify(v));

  if (dir === 'request') {
    // Head restricts what was free, or drops a value a client may send.
    if (!be && he) push(ctx, 'breaking', 'request-enum-added', loc, `now restricted to: ${he.map(String).join(', ')}`);
    for (const v of be ?? []) {
      if (!has(he, v)) push(ctx, 'breaking', 'request-enum-value-removed', loc, `value ${JSON.stringify(v)} no longer accepted`);
    }
  } else {
    // A new response value lands in a client's exhaustive switch unhandled.
    for (const v of he ?? []) {
      if (!has(be, v)) push(ctx, 'warning', 'response-enum-value-added', loc, `may now return ${JSON.stringify(v)}`);
    }
  }
}

// integer -> number is a widening for requests (a client sending 3 still
// passes); the reverse for responses (a client parsing number accepts 3).
function widens(dir: Direction, from: string, to: string): boolean {
  if (dir === 'request') return from === 'integer' && to === 'number';
  return from === 'number' && to === 'integer';
}

function typeOf(s: Schema): string | undefined {
  if (typeof s.type === 'string') return s.type;
  if (Array.isArray(s.type)) return (s.type as string[]).filter((t) => t !== 'null').sort().join('|') || undefined;
  if (s.properties) return 'object';
  if (s.items) return 'array';
  return undefined;
}

function refPair(b: unknown, h: unknown): string | undefined {
  const r = (n: unknown) => (n && typeof n === 'object' ? (n as Schema).$ref : undefined);
  const br = r(b);
  const hr = r(h);
  return typeof br === 'string' || typeof hr === 'string' ? `${String(br)}|${String(hr)}` : undefined;
}

// Follows #/components/schemas/X refs against the IR's schema table, several
// hops if needed. Anything it cannot resolve is treated as opaque.
function deref(node: unknown, ir: ApiIR): Schema | undefined {
  let cur = node;
  for (let i = 0; i < 16; i++) {
    if (!cur || typeof cur !== 'object') return undefined;
    const ref = (cur as Schema).$ref;
    if (typeof ref !== 'string') return cur as Schema;
    const m = /^#\/components\/schemas\/(.+)$/.exec(ref);
    if (!m?.[1]) return undefined;
    cur = ir.schemas[m[1].replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return undefined;
}

// Plain-text report, one line per change, breaking first.
export function formatDiff(diff: ApiDiff, opts: { includeInfo?: boolean } = {}): string {
  const order: Record<ChangeLevel, number> = { breaking: 0, warning: 1, info: 2 };
  const rows = diff.changes
    .filter((c) => opts.includeInfo || c.level !== 'info')
    .sort((a, b) => order[a.level] - order[b.level] || a.operation.localeCompare(b.operation));
  const lines = rows.map((c) => {
    const where = [c.operation, c.location].filter(Boolean).join(' ');
    return `${c.level.toUpperCase().padEnd(8)} ${where}: ${c.message} [${c.code}]`;
  });
  lines.push(`${diff.breaking} breaking, ${diff.warnings} warning${diff.warnings === 1 ? '' : 's'}`);
  return lines.join('\n');
}
