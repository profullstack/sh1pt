import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['GOOGLE_ACCESS_TOKEN', 'GOOGLE_PROJECT_ID'],
});

const ctx = (secrets: Record<string, string> = {
  GOOGLE_ACCESS_TOKEN: 'google-token',
  GOOGLE_PROJECT_ID: 'project-1',
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

  it('rejects malformed record ids before deleting records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));

    await dns.connect(ctx(), {});

    await expect(dns.deleteRecord('zone-1', 'A', {}))
      .rejects.toThrow('Invalid Google Cloud DNS record id: A');
  });

  it('deletes the matching rrset with the current TTL and values', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        rrsets: [
          { name: 'api.example.com.', type: 'A', ttl: 600, rrdatas: ['1.1.1.1', '2.2.2.2'] },
          { name: 'api.example.com.', type: 'TXT', ttl: 300, rrdatas: ['keep-me'] },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'change-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    await dns.deleteRecord('zone-1', 'A/api.example.com.', {});

    expect(fetchMock.mock.calls[0]?.[0])
      .toBe('https://dns.googleapis.com/dns/v1/projects/project-1/managedZones/zone-1/rrsets');
    expect(fetchMock.mock.calls[1]?.[0])
      .toBe('https://dns.googleapis.com/dns/v1/projects/project-1/managedZones/zone-1/changes');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer google-token' }),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      kind: 'dns#change',
      deletions: [
        {
          name: 'api.example.com.',
          type: 'A',
          ttl: 600,
          rrdatas: ['1.1.1.1', '2.2.2.2'],
        },
      ],
      additions: [],
    });
  });
});
