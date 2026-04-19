import { defineCloud, type Instance } from '@sh1pt/core';

// build.nvidia.com — NVIDIA's developer platform. Umbrella for:
//   - API Catalog (free): 100+ hosted models behind OpenAI-compatible endpoints
//     for prototyping. Not really "cloud infra" — treat as a model endpoint.
//   - NIM (NVIDIA Inference Microservices): containerized model servers you
//     self-host on any K8s / Docker / cloud.
//   - DGX Cloud / DGX Cloud Lepton: NVIDIA-managed GPU capacity (A100, H100,
//     H200, Blackwell). Rent dedicated clusters or on-demand through the
//     Lepton marketplace.
//
// This adapter picks one of those via `product`. Use cloud-runpod / cloud-vultr
// for cheaper per-hour commodity GPUs; cloud-nvidia when you need NIM /
// NVIDIA-managed capacity / B-series accelerators.
interface Config {
  product: 'dgx-cloud' | 'dgx-lepton' | 'nim' | 'api-catalog';
  orgId?: string;                         // NGC org id
  region?: string;                        // e.g. 'us-east', 'eu-west'
  // NIM-specific — Kubernetes cluster to deploy into
  nim?: { modelName: string; k8sContext?: string; namespace?: string };
  // API catalog — uses free-tier by default; paid tier requires NGC_API_KEY
  apiCatalog?: { model: string };
}

export default defineCloud<Config>({
  id: 'cloud-nvidia',
  label: 'NVIDIA (DGX Cloud / Lepton / NIM / API Catalog)',
  supports: ['gpu', 'bare-metal', 'managed-db'],

  async connect(ctx, config) {
    // API Catalog free tier works with an unauthenticated trial; everything
    // else needs an NGC / build.nvidia.com API key.
    if (config.product !== 'api-catalog' && !ctx.secret('NGC_API_KEY')) {
      throw new Error('NGC_API_KEY not in vault — get one at https://build.nvidia.com and `sh1pt secret set NGC_API_KEY`');
    }
    ctx.log(`nvidia connected · product=${config.product}`);
    return { accountId: config.orgId ?? 'nvidia' };
  },

  async quote(ctx, spec, config) {
    ctx.log(`nvidia quote · product=${config.product} · gpu=${spec.gpu?.model} x${spec.gpu?.count ?? 1}`);
    // DGX Cloud pricing is gated behind enterprise sales; Lepton is an
    // on-demand marketplace with per-minute GPU rates (variable). API
    // Catalog free tier has rate-limits rather than dollar cost.
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'nvidia', sku: `nvidia-${config.product}`, spot: false };
  },

  async provision(ctx, spec, config): Promise<Instance> {
    ctx.log(`nvidia provision · ${config.product}`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    // TODO per product:
    //   dgx-cloud    → NGC API POST /v2/orgs/:orgId/deployments with cluster spec
    //   dgx-lepton   → Lepton API POST /api/v2/pods { resource_shape: 'gpu.h100', ... }
    //   nim          → kubectl apply a NIM Helm chart; NGC_API_KEY as imagePullSecret
    //   api-catalog  → no provisioning — just return a "virtual" instance pointing
    //                  at api.nvidia.com/v1/chat/completions (OpenAI-compatible)
    return stub(`nvidia_${Date.now()}`, 'provisioning', spec.kind);
  },

  async list() { return []; },
  async destroy(ctx, id) { ctx.log(`nvidia destroy ${id}`); },
  async status(ctx, id) {
    return stub(id, 'running', 'gpu');
  },
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
