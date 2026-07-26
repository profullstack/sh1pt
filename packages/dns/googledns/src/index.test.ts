import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['GOOGLE_ACCESS_TOKEN', 'GOOGLE_PROJECT_ID'],
});

const ctx = (secrets: Record<string, string> = {
  GOOGLE_ACCESS_TOKEN: 'google-token',
  GOOGLE_PROJECT_ID: 'demo-project',
}) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
});

describe('Google Cloud DNS adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back when Google DNS TTL values are not positive safe integers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      rrsets: [
        {
          name: 'www.example.com.',
          type: 'A',
          ttl: 600.5,
          rrdatas: ['1.1.1.1'],
        },
        {
          name: 'api.example.com.',
          type: 'A',
          ttl: Number.POSITIVE_INFINITY,
          rrdatas: ['2.2.2.2'],
        },
      ],
    })));

    await dns.connect(ctx(), {});
    const records = await dns.listRecords('example-zone', { defaultTtl: 900.5 });

    expect(records).toEqual([
      { id: 'A/www.example.com.', zone: 'example-zone', name: 'www.example.com', type: 'A', value: '1.1.1.1', ttl: 300 },
      { id: 'A/api.example.com.', zone: 'example-zone', name: 'api.example.com', type: 'A', value: '2.2.2.2', ttl: 300 },
    ]);
  });

  it('matches existing records when upserting a trailing-dot FQDN', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        rrsets: [{
          name: 'www.example.com.',
          type: 'A',
          ttl: 300,
          rrdatas: ['1.1.1.1'],
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'change-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const record = await dns.upsertRecord('example-zone', {
      zone: 'example-zone',
      name: 'www.example.com.',
      type: 'A',
      value: '2.2.2.2',
      ttl: 600,
    }, {});

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://dns.googleapis.com/dns/v1/projects/demo-project/managedZones/example-zone/changes');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      kind: 'dns#change',
      deletions: [{
        name: 'www.example.com.',
        type: 'A',
        ttl: 300,
        rrdatas: ['1.1.1.1'],
      }],
      additions: [{
        name: 'www.example.com.',
        type: 'A',
        ttl: 600,
        rrdatas: ['2.2.2.2'],
      }],
    });
    expect(record).toMatchObject({
      id: 'A/www.example.com.',
      name: 'www.example.com.',
      value: '2.2.2.2',
    });
  });

  it('does not send fractional TTL values when upserting records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ rrsets: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'change-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    await dns.upsertRecord('example-zone', {
      zone: 'example-zone',
      name: 'www.example.com',
      type: 'A',
      value: '2.2.2.2',
      ttl: 600.5,
    }, { defaultTtl: 1200 });

    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toMatchObject({
      additions: [{
        name: 'www.example.com.',
        type: 'A',
        ttl: 1200,
        rrdatas: ['2.2.2.2'],
      }],
    });
  });

  it('uses a valid default TTL for round-robin records', async () => {
    await dns.connect(ctx(), {});

    await expect(dns.syncRoundRobin({
      zoneId: 'example-zone',
      name: 'api.example.com',
      ips: ['1.1.1.1', '2.2.2.2'],
      ttl: 600.5,
    }, { defaultTtl: 1200 })).resolves.toEqual([
      { id: 'gcp-rr-0', zone: 'example-zone', name: 'api.example.com', type: 'A', value: '1.1.1.1', ttl: 1200 },
      { id: 'gcp-rr-1', zone: 'example-zone', name: 'api.example.com', type: 'A', value: '2.2.2.2', ttl: 1200 },
    ]);
  });
});
