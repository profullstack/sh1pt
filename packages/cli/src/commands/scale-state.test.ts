import { describe, expect, it } from 'vitest';
import { summarizeScaleCost, summarizeScaleStatus, type ScaleState } from './scale-state.js';

const state: ScaleState = {
  instances: [
    { id: 'web-1', provider: 'cloud-fly', status: 'running', publicIp: '203.0.113.10', hourlyRate: 0.03, currency: 'USD' },
    { id: 'web-2', provider: 'cloud-fly', status: 'stopped', hourlyRate: 0.01, currency: 'USD' },
    { id: 'gpu-1', provider: 'cloud-runpod', status: 'destroyed', hourlyRate: 2.5, currency: 'USD' },
    { id: 'db-1', provider: 'cloud-neon', status: 'running', currency: 'USD' },
  ],
  dns: [
    { provider: 'dns-cloudflare', domain: 'api.example.com', ttl: 60, records: [{ type: 'A', name: '@', value: '203.0.113.10' }] },
  ],
  autoRules: { min: 1, max: 4, targetCpu: 70, cooldown: 300 },
};

describe('scale state summaries', () => {
  it('summarizes active fleet cost and ignores destroyed instances', () => {
    const summary = summarizeScaleCost(state);

    expect(summary.hourly).toBe(0.04);
    expect(summary.monthly).toBe(29.2);
    expect(summary.byProvider['cloud-fly']).toEqual({ hourly: 0.04, monthly: 29.2, instances: 2 });
    expect(summary.byProvider['cloud-runpod']).toBeUndefined();
  });

  it('flags stopped paid instances and missing rates', () => {
    const summary = summarizeScaleCost(state);

    expect(summary.suggestions).toContain('destroy or resize 1 stopped paid instance(s)');
    expect(summary.suggestions).toContain('add hourlyRate to 1 instance(s) for complete cost reporting');
  });

  it('summarizes fleet status, DNS, and public IPs', () => {
    const summary = summarizeScaleStatus(state);

    expect(summary.byStatus).toEqual({ running: 2, stopped: 1, destroyed: 1 });
    expect(summary.publicIps).toEqual(['203.0.113.10']);
    expect(summary.dns[0]?.domain).toBe('api.example.com');
    expect(summary.autoRules?.max).toBe(4);
  });
});
