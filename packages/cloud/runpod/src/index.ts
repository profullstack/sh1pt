import { defineCloud, type Instance, type Quote, type InstanceSpec } from '@sh1pt/core';

// RunPod — GPU-first, pay-by-the-second. GraphQL API. Two pod types:
//   - Community Cloud: cheapest, non-SLA, host may reclaim
//   - Secure Cloud: SLA, redundant, 1.5–2× the cost
interface Config {
  apiKey?: string;                     // stored as RUNPOD_API_KEY secret
  cloudType?: 'COMMUNITY' | 'SECURE';
  networkVolumeId?: string;
}

export default defineCloud<Config>({
  id: 'cloud-runpod',
  label: 'RunPod (GPU)',
  supports: ['gpu'],

  async connect(ctx) {
    const key = ctx.secret('RUNPOD_API_KEY');
    if (!key) throw new Error('RUNPOD_API_KEY not set — `sh1pt secret set RUNPOD_API_KEY ...`');
    ctx.log('runpod connected');
    return { accountId: 'runpod-account' };
  },

  async quote(ctx, spec) {
    ctx.log(`runpod quote · gpu=${spec.gpu?.model} x${spec.gpu?.count ?? 1} · spot=${spec.spotOk ?? false}`);
    // TODO: GraphQL query gpuTypes { id, displayName, communityPrice, securePrice }
    // Pick the cheapest SKU matching spec.gpu.model + spec.gpu.count.
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'runpod', sku: 'stub', spot: !!spec.spotOk };
  },

  async provision(ctx, spec, config): Promise<Instance> {
    if (!spec.gpu) throw new Error('cloud-runpod: spec.gpu is required');
    if (spec.maxHourlyPrice !== undefined) {
      ctx.log(`maxHourlyPrice=${spec.maxHourlyPrice} — quote will be validated before launch`);
    }
    ctx.log(`runpod provision · ${spec.gpu.count}×${spec.gpu.model} · ${config.cloudType ?? 'COMMUNITY'}`);
    if (ctx.dryRun) {
      return stubInstance('dry-run', 'provisioning', spec);
    }
    // TODO: GraphQL mutation podFindAndDeployOnDemand({ gpuCount, gpuTypeId, imageName, ... })
    return stubInstance(`pod_${Date.now()}`, 'provisioning', spec);
  },

  async list() {
    return [];
  },

  async destroy(ctx, instanceId) {
    ctx.log(`runpod destroy pod=${instanceId}`);
    // TODO: GraphQL mutation podTerminate({ podId })
  },

  async status(ctx, instanceId) {
    ctx.log(`runpod status pod=${instanceId}`);
    return stubInstance(instanceId, 'running', { kind: 'gpu' });
  },
});

function stubInstance(id: string, status: Instance['status'], spec: Partial<InstanceSpec>): Instance {
  return {
    id,
    kind: spec.kind ?? 'gpu',
    status,
    createdAt: new Date().toISOString(),
    hourlyRate: 0,
    currency: 'USD',
  };
}
