import { defineCloud, tokenSetup, type Instance } from '@profullstack/sh1pt-core';

// Railway — app hosting with a GraphQL API. Not a raw-VPS provider,
// but sh1pt models each Railway *service* as an instance for scaling
// purposes. `sh1pt scale up --provider cloud-railway` bumps replica
// count; `destroy` removes the service.
interface Config {
  projectId?: string;
  serviceId?: string;
  environmentId?: string;
  region?: string;                    // us-east, us-west, europe-west, etc.
}

const API = 'https://backboard.railway.app/graphql/v2';

async function railwayGql<T = unknown>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Railway: ${json.errors![0]!.message}`);
  if (!res.ok) throw new Error(`Railway HTTP ${res.status}`);
  return json.data as T;
}

function serviceToInstance(s: {
  id: string;
  createdAt?: string;
  serviceInstances?: { edges: Array<{ node: { status?: string } }> };
}, kind: Instance['kind'] = 'cpu-vps'): Instance {
  const rawStatus = s.serviceInstances?.edges[0]?.node?.status ?? 'ACTIVE';
  const status: Instance['status'] =
    rawStatus === 'ACTIVE' || rawStatus === 'SUCCESS' ? 'running' :
    rawStatus === 'BUILDING' || rawStatus === 'DEPLOYING' ? 'provisioning' :
    rawStatus === 'REMOVED' ? 'destroyed' : 'failed';
  return {
    id: s.id,
    kind,
    status,
    createdAt: s.createdAt ?? new Date().toISOString(),
    hourlyRate: 0,
    currency: 'USD',
  };
}

export default defineCloud<Config>({
  id: 'cloud-railway',
  label: 'Railway (scalable services)',
  supports: ['cpu-vps', 'managed-db', 'object-storage'],

  async connect(ctx) {
    if (!ctx.secret('RAILWAY_TOKEN')) throw new Error('RAILWAY_TOKEN not set');
    return { accountId: 'railway' };
  },

  async quote(ctx, spec) {
    ctx.log(`railway quote · kind=${spec.kind}`);
    // Railway pricing is per-minute vCPU + memory (Hobby/Pro plan).
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'railway', sku: 'usage', spot: false };
  },

  async provision(ctx, spec, config) {
    ctx.log(`railway serviceCreate · project=${config.projectId}`);
    if (!config.projectId) throw new Error('config.projectId is required for Railway provisioning');
    if (spec.kind === 'gpu') throw new Error('GPU workloads not supported on Railway — use cloud-runpod instead');
    if (ctx.dryRun) return { id: 'dry-run', kind: spec.kind, status: 'provisioning', createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };

    const token = ctx.secret('RAILWAY_TOKEN')!;
    const data = await railwayGql<{ serviceCreate: { id: string; createdAt: string } }>(
      token,
      `mutation ServiceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) { id createdAt }
      }`,
      {
        input: {
          name: `sh1pt-${spec.kind}-${Date.now()}`,
          projectId: config.projectId,
          ...(config.region ? { region: config.region } : {}),
        },
      },
    );
    return serviceToInstance({ id: data.serviceCreate.id, createdAt: data.serviceCreate.createdAt }, spec.kind);
  },

  async list(ctx, config) {
    ctx.log(`railway services · project=${config?.projectId}`);
    if (!config?.projectId) return [];
    const token = ctx.secret('RAILWAY_TOKEN')!;
    const data = await railwayGql<{
      project: { services: { edges: Array<{ node: { id: string; createdAt: string; serviceInstances: { edges: Array<{ node: { status: string } }> } } }> } };
    }>(
      token,
      `query ProjectServices($id: String!) {
        project(id: $id) {
          services {
            edges {
              node {
                id
                createdAt
                serviceInstances { edges { node { status } } }
              }
            }
          }
        }
      }`,
      { id: config.projectId },
    );
    return data.project.services.edges.map(e => serviceToInstance(e.node));
  },

  async destroy(ctx, id) {
    ctx.log(`railway serviceDelete · id=${id}`);
    const token = ctx.secret('RAILWAY_TOKEN')!;
    await railwayGql(
      token,
      `mutation ServiceDelete($id: ID!) { serviceDelete(id: $id) }`,
      { id },
    );
  },

  async status(ctx, id) {
    ctx.log(`railway service status · id=${id}`);
    const token = ctx.secret('RAILWAY_TOKEN')!;
    const data = await railwayGql<{
      service: { id: string; createdAt: string; serviceInstances: { edges: Array<{ node: { status: string } }> } };
    }>(
      token,
      `query ServiceStatus($id: ID!) {
        service(id: $id) {
          id
          createdAt
          serviceInstances { edges { node { status } } }
        }
      }`,
      { id },
    );
    return serviceToInstance(data.service);
  },

  setup: tokenSetup({
    secretKey: 'RAILWAY_TOKEN',
    label: 'Railway',
    vendorDocUrl: 'https://railway.app/account/tokens',
    steps: [
      'Install with mise: mise use npm:@railway/cli',
      'Authenticate locally: railway login',
      'Open https://railway.app/account/tokens',
      'Create an API token with full / read-write scope',
      'Copy the token (usually shown once)',
    ],
  }),
});
