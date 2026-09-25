import type { Inventory, Platform, PlatformContext, Resource } from '../types.js';
import { plain, secret } from '../types.js';

/**
 * Railway.
 *
 * A Railway project is services plus volumes plus variables, and the data
 * worth moving hides in the variables: a Postgres service's connection string
 * is `DATABASE_URL` on the services that use it, not something the API hands
 * over as a database object. So the inventory reads variables and recognises
 * connection strings in them, rather than asking for a list of databases that
 * does not exist in that shape.
 *
 * `role: 'both'` — Railway is a perfectly good destination, and "we tried
 * bare metal and went back" is a migration people actually make. Provisioning
 * a service here is not automated: creating billable infrastructure is a
 * decision, and `sh1pt deploy` is where that lives. What this does is resolve
 * an existing service's connection so data can be written into it.
 */

const API = 'https://backboard.railway.app/graphql/v2';

export interface RailwayConfig {
  projectId: string;
  environmentId?: string;
  /** Overrides the RAILWAY_TOKEN secret when set. */
  token?: string;
}

interface GqlVariable {
  name: string;
  value: string;
}

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Railway: ${json.errors[0]!.message}`);
  if (!res.ok) throw new Error(`Railway HTTP ${res.status}`);
  return json.data as T;
}

/**
 * Recognise a connection string by its scheme.
 *
 * Deliberately not by variable name. `DATABASE_URL` is the convention but
 * plenty of apps use `PG_URL`, `POSTGRES_URI` or something bespoke, and a
 * migration that silently skipped the database because it was called the wrong
 * thing would be the worst possible failure. The scheme is the fact.
 */
export function classifyConnection(value: string): Resource['kind'] | undefined {
  if (/^postgres(ql)?:\/\//i.test(value)) return 'postgres';
  if (/^mysql:\/\//i.test(value)) return 'mysql';
  if (/^rediss?:\/\//i.test(value)) return 'redis';
  if (/^libsql:\/\//i.test(value)) return 'sqlite';
  return undefined;
}

/** Variables whose value is a connection string, deduplicated by target. */
export function connectionsFromVariables(vars: GqlVariable[]): Array<{
  kind: Resource['kind'];
  name: string;
  url: string;
}> {
  const seen = new Set<string>();
  const out: Array<{ kind: Resource['kind']; name: string; url: string }> = [];
  for (const v of vars) {
    const kind = classifyConnection(v.value);
    if (!kind) continue;
    // The same database is usually injected into several services under the
    // same or different names; moving it once is the point.
    if (seen.has(v.value)) continue;
    seen.add(v.value);
    out.push({ kind, name: v.name, url: v.value });
  }
  return out;
}

export const railwayPlatform: Platform<RailwayConfig> = {
  id: 'railway',
  label: 'Railway',
  role: 'both',
  supports: ['postgres', 'mysql', 'redis', 'sqlite', 'files'],

  async inventory(ctx: PlatformContext, config: RailwayConfig): Promise<Inventory> {
    const token = config.token ?? ctx.secret('RAILWAY_TOKEN');
    if (!token) throw new Error('Railway needs a RAILWAY_TOKEN');
    if (!config.projectId) throw new Error('Railway needs a projectId');

    const data = await gql<{
      project: {
        name: string;
        services: { edges: Array<{ node: { id: string; name: string } }> };
        volumes: { edges: Array<{ node: { id: string; name: string; mountPath?: string } }> };
      };
    }>(
      token,
      `query ($id: String!) {
        project(id: $id) {
          name
          services { edges { node { id name } } }
          volumes { edges { node { id name } } }
        }
      }`,
      { id: config.projectId },
    );

    const resources: Resource[] = [];
    const notes: string[] = [];

    for (const edge of data.project.volumes.edges) {
      const v = edge.node;
      resources.push({
        kind: 'files',
        id: `volume-${v.id}`,
        name: v.name,
        // A Railway volume is only reachable from inside a service, so it
        // cannot be rsynced from here. Recorded so the plan shows it and a
        // person decides, rather than being silently dropped.
        connection: { path: plain(v.mountPath ?? '/data') },
        quirks: [
          'a Railway volume is only reachable from inside its service; copy it out with `railway run` or a one-off container rather than over ssh',
        ],
      });
    }

    for (const edge of data.project.services.edges) {
      const service = edge.node;
      const vars = await gql<{ variables: GqlVariable[] }>(
        token,
        `query ($projectId: String!, $serviceId: String!, $environmentId: String) {
          variables(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId) { name value }
        }`,
        {
          projectId: config.projectId,
          serviceId: service.id,
          environmentId: config.environmentId ?? null,
        },
      ).catch(() => ({ variables: [] as GqlVariable[] }));

      for (const conn of connectionsFromVariables(vars.variables ?? [])) {
        resources.push({
          kind: conn.kind,
          id: `${service.id}-${conn.name}`,
          name: `${service.name}/${conn.name}`,
          connection: { url: secret(conn.url) },
          metadata: { service: service.name, variable: conn.name },
        });
      }
    }

    if (!resources.length) {
      notes.push(
        'No connection strings were found in this project. Either the token cannot read variables, or the databases are referenced another way.',
      );
    }

    ctx.log(`${data.project.name}: ${resources.length} resource(s)`);
    return { platform: 'railway', scope: data.project.name, resources, notes };
  },

  async check(ctx: PlatformContext, config: RailwayConfig): Promise<void> {
    const token = config.token ?? ctx.secret('RAILWAY_TOKEN');
    if (!token) throw new Error('Railway needs a RAILWAY_TOKEN');
    await gql(token, `query ($id: String!) { project(id: $id) { id } }`, { id: config.projectId });
  },
};
