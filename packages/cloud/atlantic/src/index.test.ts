import { createHmac } from 'node:crypto';
import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

const secret = {
  secret: (key: string) => {
    if (key === 'ATLANTIC_API_KEY') return 'test-api-key';
    if (key === 'ATLANTIC_SECRET_KEY') return 'test-private-key';
    return undefined;
  },
  log: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const action = requestParam(init, 'Action');
    if (action === 'list-instances') return jsonResponse(listInstancesResponse());
    if (action === 'describe-plan') return jsonResponse(describePlanResponse());
    if (action === 'describe-image') return jsonResponse(describeImageResponse());
    if (action === 'describe-instance') return jsonResponse(describeInstanceResponse());
    if (action === 'run-instance') return jsonResponse(runInstanceResponse());
    if (action === 'terminate-instance') return jsonResponse(terminateInstanceResponse());
    return jsonResponse({ error: `unexpected ${action}` }, { ok: false, status: 400, statusText: 'Bad Request' });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Atlantic.Net cloud adapter', () => {
  it('requires both API credentials', async () => {
    await expect(adapter.connect({
      secret: (key: string) => key === 'ATLANTIC_API_KEY' ? 'test-api-key' : undefined,
      log: vi.fn(),
    }, {})).rejects.toThrow('ATLANTIC_SECRET_KEY not in vault');
  });

  it('chooses the cheapest matching plan and honors maxHourlyPrice', async () => {
    const quote = await adapter.quote(secret, {
      kind: 'cpu-vps',
      cpu: 2,
      memory: 4,
      storage: 80,
      maxHourlyPrice: 0.06,
    }, {});

    expect(quote).toMatchObject({
      hourly: 0.0547,
      provider: 'atlantic',
      sku: 'G2.4GB',
      currency: 'USD',
    });
  });

  it('rejects missing plan matches instead of returning a fake zero dollar quote', async () => {
    await expect(adapter.quote(secret, {
      kind: 'cpu-vps',
      cpu: 64,
      memory: 512,
      storage: 4000,
    }, {})).rejects.toThrow('Atlantic.Net no matching cpu-vps plan');
  });

  it('does not call the API during dry-run provision', async () => {
    vi.mocked(fetch).mockClear();

    const instance = await adapter.provision({
      ...secret,
      dryRun: true,
    }, {
      kind: 'cpu-vps',
      region: 'USEAST2',
    }, {});

    expect(instance).toMatchObject({
      id: 'dry-run',
      status: 'provisioning',
      region: 'USEAST2',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signs run-instance requests and sends the selected plan safely', async () => {
    const calls: URLSearchParams[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const params = bodyParams(init);
      calls.push(params);
      if (params.get('Action') === 'describe-plan') return jsonResponse(describePlanResponse());
      if (params.get('Action') === 'run-instance') return jsonResponse(runInstanceResponse());
      return jsonResponse(describeImageResponse());
    }));

    const instance = await adapter.provision({
      ...secret,
      dryRun: false,
    }, {
      kind: 'cpu-vps',
      cpu: 2,
      memory: 4,
      storage: 80,
      region: 'USEAST2',
      image: 'ubuntu-24.04_64bit',
      sshKeyIds: ['key-123'],
      maxHourlyPrice: 0.06,
    }, {});

    expect(instance).toMatchObject({
      id: '153979',
      status: 'provisioning',
      publicIp: '45.58.35.251',
      hourlyRate: 0.0547,
      sku: 'G2.4GB',
      region: 'USEAST2',
    });

    const run = calls.find(call => call.get('Action') === 'run-instance');
    expect(run?.get('planname')).toBe('G2.4GB');
    expect(run?.get('imageid')).toBe('ubuntu-24.04_64bit');
    expect(run?.get('server_qty')).toBe('1');
    expect(run?.get('vm_location')).toBe('USEAST2');
    expect(run?.get('enablebackup')).toBe('N');
    expect(run?.get('term')).toBe('on-demand');
    expect(run?.get('key_id')).toBe('key-123');
    expect(run?.get('ACSAccessKeyId')).toBe('test-api-key');
    expect(run?.get('Signature')).toBe(sign(run!));
  });

  it('auto-selects the newest Ubuntu image when no image is provided', async () => {
    const calls: URLSearchParams[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const params = bodyParams(init);
      calls.push(params);
      if (params.get('Action') === 'describe-plan') return jsonResponse(describePlanResponse());
      if (params.get('Action') === 'describe-image') return jsonResponse(describeImageResponse());
      if (params.get('Action') === 'run-instance') return jsonResponse(runInstanceResponse());
      return jsonResponse({ error: 'unexpected action' }, { ok: false, status: 400, statusText: 'Bad Request' });
    }));

    await adapter.provision({
      ...secret,
      dryRun: false,
    }, {
      kind: 'cpu-vps',
      cpu: 2,
      memory: 4,
      region: 'USEAST2',
    }, {});

    const run = calls.find(call => call.get('Action') === 'run-instance');
    expect(calls.map(call => call.get('Action'))).toContain('describe-image');
    expect(run?.get('imageid')).toBe('ubuntu-24.04_64bit');
  });

  it('enforces maxHourlyPrice before run-instance', async () => {
    await expect(adapter.provision({
      ...secret,
      dryRun: false,
    }, {
      kind: 'cpu-vps',
      cpu: 2,
      memory: 4,
      maxHourlyPrice: 0.01,
    }, {})).rejects.toThrow('no matching cpu-vps plan found for provisioning');

    const actions = vi.mocked(fetch).mock.calls.map(([, init]) => requestParam(init as RequestInit, 'Action'));
    expect(actions).not.toContain('run-instance');
  });

  it('lists and describes Atlantic instances', async () => {
    const instances = await adapter.list(secret, {});
    expect(instances).toHaveLength(2);
    expect(instances[0]).toMatchObject({
      id: '145607',
      status: 'running',
      publicIp: '209.208.65.177',
      sku: 'G2.1GB',
    });

    const instance = await adapter.status(secret, '153979', {});
    expect(instance).toMatchObject({
      id: '153979',
      status: 'running',
      hourlyRate: 0.0547,
      sku: 'G2.4GB',
    });
  });

  it('honors destroy dry-run and sends live terminate-instance requests', async () => {
    vi.mocked(fetch).mockClear();
    await adapter.destroy({
      ...secret,
      dryRun: true,
    }, '153979', {});
    expect(fetch).not.toHaveBeenCalled();

    await adapter.destroy({
      ...secret,
      dryRun: false,
    }, '153979', {});
    const params = bodyParams(vi.mocked(fetch).mock.calls[0]![1] as RequestInit);
    expect(params.get('Action')).toBe('terminate-instance');
    expect(params.get('instanceid')).toBe('153979');
  });

  it('reports non-JSON API errors without parser noise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'temporarily unavailable',
    }));

    await expect(adapter.quote(secret, {
      kind: 'cpu-vps',
      region: 'USEAST2',
    }, {})).rejects.toThrow('Atlantic.Net describe-plan failed: 503 temporarily unavailable');
  });

  it('rejects multiple SSH keys because Atlantic accepts one key_id', async () => {
    await expect(adapter.provision({
      ...secret,
      dryRun: false,
    }, {
      kind: 'cpu-vps',
      cpu: 1,
      memory: 1,
      sshKeyIds: ['key-1', 'key-2'],
    }, {})).rejects.toThrow('accepts one SSH key id');
  });
});

contractTestCloud(adapter, {
  sampleConfig: {},
  sampleSpec: { kind: 'cpu-vps', cpu: 2, memory: 4, region: 'USEAST2' },
  requiredSecrets: ['ATLANTIC_API_KEY', 'ATLANTIC_SECRET_KEY'],
});

function jsonResponse(data: unknown, overrides: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(data),
    ...overrides,
  } as Response;
}

function bodyParams(init: RequestInit): URLSearchParams {
  return new URLSearchParams(String(init.body));
}

function requestParam(init: RequestInit | undefined, key: string): string | null {
  if (!init) return null;
  return bodyParams(init).get(key);
}

function sign(params: URLSearchParams): string {
  return createHmac('sha256', 'test-private-key')
    .update(`${params.get('Timestamp')}${params.get('Rndguid')}`)
    .digest('base64');
}

function describePlanResponse() {
  return {
    Timestamp: 1,
    'describe-planresponse': {
      plans: {
        '1item': {
          plan_name: 'G2.1GB',
          display_ram: '1024MB',
          display_disk: '40GB',
          num_cpu: '1',
          rate_per_hr: '0.0341',
          rate_per_month: '24.89',
          platform: 'linux',
        },
        item: {
          plan_name: 'G2.4GB',
          display_ram: '4096MB',
          display_disk: '100GB',
          num_cpu: '2',
          rate_per_hr: '0.0547',
          rate_per_month: '39.95',
          platform: 'linux',
        },
        '3item': {
          plan_name: 'Windows.4GB',
          display_ram: '4096MB',
          display_disk: '100GB',
          num_cpu: '2',
          rate_per_hr: '0.07',
          platform: 'windows',
        },
        '4item': {
          plan_name: 'FreeBSD.4GB',
          display_ram: '4096MB',
          display_disk: '100GB',
          num_cpu: '2',
          rate_per_hr: '0.01',
          platform: 'freebsd',
        },
      },
      requestid: 'req-plans',
    },
  };
}

function describeImageResponse() {
  return {
    Timestamp: 1,
    'describe-imageresponse': {
      imagesset: {
        '1item': {
          imageid: 'ubuntu-22.04_64bit',
          displayname: 'Ubuntu 22.04 LTS Server 64-Bit',
          platform: 'linux',
          version: '22.04',
        },
        item: {
          imageid: 'ubuntu-24.04_64bit',
          displayname: 'Ubuntu 24.04 LTS Server 64-Bit',
          platform: 'linux',
          version: '24.04',
        },
      },
    },
  };
}

function runInstanceResponse() {
  return {
    Timestamp: 1,
    'run-instanceresponse': {
      instancesSet: {
        item: {
          instanceid: '153979',
          ip_address: '45.58.35.251',
        },
      },
      requestid: 'req-run',
    },
  };
}

function listInstancesResponse() {
  return {
    Timestamp: 1,
    'list-instancesresponse': {
      instancesSet: {
        metadata: {
          total: '2',
        },
        '1item': {
          InstanceId: '145607',
          rate_per_hr: '0.0341',
          vm_created_date: '1438048503',
          vm_description: 'New',
          vm_ip_address: '209.208.65.177',
          vm_plan_name: 'G2.1GB',
          vm_status: 'RUNNING',
        },
        item: {
          InstanceId: '153979',
          rate_per_hr: '0.0547',
          vm_created_date: '1440018294',
          vm_description: 'apitestserver',
          vm_ip_address: '45.58.35.251',
          vm_plan_name: 'G2.4GB',
          vm_status: 'RUNNING',
        },
      },
    },
  };
}

function describeInstanceResponse() {
  return {
    Timestamp: 1,
    'describe-instanceresponse': {
      instancesSet: {
        item: {
          InstanceId: '153979',
          rate_per_hr: '0.0547',
          vm_created_date: '1440018294',
          vm_description: 'apitestserver',
          vm_ip_address: '45.58.35.251',
          vm_plan_name: 'G2.4GB',
          vm_status: 'RUNNING',
        },
      },
    },
  };
}

function terminateInstanceResponse() {
  return {
    Timestamp: 1,
    'terminate-instanceresponse': {
      instancesSet: {
        item: {
          InstanceId: '153979',
          message: 'queued for termination',
          result: 'true',
        },
      },
    },
  };
}
