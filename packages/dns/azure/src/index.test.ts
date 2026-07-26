import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'],
});

const ctx = (secrets: Record<string, string> = {
  AZURE_CLIENT_ID: 'azure-client',
  AZURE_CLIENT_SECRET: 'azure-secret',
  AZURE_TENANT_ID: 'azure-tenant',
  AZURE_SUBSCRIPTION_ID: 'azure-subscription',
  AZURE_RESOURCE_GROUP: 'dns-rg',
}) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
});

describe('Azure DNS adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back when Azure DNS TTL values are not positive safe integers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'azure-token' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'azure-token' }))
      .mockResolvedValueOnce(jsonResponse({
        value: [
          {
            name: '@',
            type: 'Microsoft.Network/dnsZones/A',
            properties: { TTL: 600.5, ARecords: [{ ipv4Address: '1.2.3.4' }] },
            etag: 'etag-a',
          },
          {
            name: 'www',
            type: 'Microsoft.Network/dnsZones/CNAME',
            properties: { TTL: Number.POSITIVE_INFINITY, CNAMERecord: { cname: 'example.net' } },
            etag: 'etag-cname',
          },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const records = await dns.listRecords('example.com', { defaultTtl: 900.5 });

    expect(records).toEqual([
      { id: 'etag-a', zone: 'example.com', name: 'example.com', type: 'A', value: '1.2.3.4', ttl: 3600 },
      { id: 'etag-cname', zone: 'example.com', name: 'www.example.com', type: 'CNAME', value: 'example.net', ttl: 3600 },
    ]);
  });

  it('does not send fractional TTL values when upserting records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'azure-token' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'azure-token' }))
      .mockResolvedValueOnce(jsonResponse({ etag: 'new-etag' }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'www.example.com',
      type: 'A',
      value: '1.2.3.4',
      ttl: 600.5,
    }, { defaultTtl: 1200 });

    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1].body))).toEqual({
      properties: {
        TTL: 1200,
        ARecords: [{ ipv4Address: '1.2.3.4' }],
      },
    });
  });

  it('uses a valid default TTL for round-robin records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ access_token: 'azure-token' })));

    await dns.connect(ctx(), {});

    await expect(dns.syncRoundRobin({
      zoneId: 'example.com',
      name: 'api.example.com',
      ips: ['1.1.1.1', '2.2.2.2'],
      ttl: 600.5,
    }, { defaultTtl: 1200 })).resolves.toEqual([
      { id: 'azure-rr-0', zone: 'example.com', name: 'api.example.com', type: 'A', value: '1.1.1.1', ttl: 1200 },
      { id: 'azure-rr-1', zone: 'example.com', name: 'api.example.com', type: 'A', value: '2.2.2.2', ttl: 1200 },
    ]);
  });
});
