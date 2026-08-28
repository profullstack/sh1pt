import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { defaultSkills: ['Research'] },
  samplePost: {
    title: 'Research one public technical question',
    body: 'I will answer one bounded public technical question with primary sources and explicit confidence labels.',
  },
  requiredSecrets: ['UGIG_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-ugig adapter', () => {
  it('connects through the current ugig profile endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ profile: { id: 'user-123', username: 'safe_earn_393559' } }),
    } as any);

    const ctx = fakeConnectContext({ UGIG_TOKEN: 'test-token' });
    const result = await adapter.connect(ctx as any, {});

    expect(result.accountId).toBe('safe_earn_393559');
    expect(fetch).toHaveBeenCalledWith(
      'https://ugig.net/api/profile',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('creates a for-hire listing with the current GigInput fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      gig: { id: 'gig-123' },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const ctx = {
      ...fakeConnectContext({ UGIG_TOKEN: 'test-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Review one TypeScript script for bugs',
      body: 'I will review one public TypeScript script and return exact file and line findings with a corrected patch.',
      hashtags: ['ignored-when-default-skills-exist'],
      link: 'https://github.com/example/repository/pull/1',
    }, {
      defaultCategory: 'Development',
      defaultSkills: ['TypeScript', 'Code Review'],
      defaultAiTools: ['Codex'],
      defaultPriceCents: 2500,
      paymentCoin: 'USDC',
      duration: '6 hours',
    });

    expect(result).toEqual({
      id: 'gig-123',
      url: 'https://ugig.net/gigs/gig-123',
      platform: 'ugig',
      publishedAt: expect.any(String),
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ugig.net/api/gigs');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      listing_type: 'for_hire',
      title: 'Review one TypeScript script for bugs',
      description: 'I will review one public TypeScript script and return exact file and line findings with a corrected patch.\n\nhttps://github.com/example/repository/pull/1',
      category: 'Development',
      skills_required: ['TypeScript', 'Code Review'],
      ai_tools_preferred: ['Codex'],
      budget_type: 'fixed',
      budget_min: 25,
      budget_max: 25,
      payment_coin: 'USDC',
      duration: '6 hours',
      location_type: 'remote',
      status: 'active',
    });
  });

  it('uses hashtags as required skills and omits a negotiable price', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'gig-456',
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const ctx = {
      ...fakeConnectContext({ UGIG_TOKEN: 'test-token' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      title: 'Research one public technical question',
      body: 'I will answer one bounded public technical question with authoritative sources and a concise conclusion.',
      hashtags: ['#research', 'source-verification'],
    }, { listingType: 'hiring' });

    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload.listing_type).toBe('hiring');
    expect(payload.skills_required).toEqual(['research', 'source-verification']);
    expect(payload).not.toHaveProperty('price_cents');
    expect(payload).not.toHaveProperty('budget_min');
    expect(payload).not.toHaveProperty('budget_max');
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('tags');
  });

  it('rejects values below the current uGig minimums before calling the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const ctx = {
      ...fakeConnectContext({ UGIG_TOKEN: 'test-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Too short',
      body: 'This description is long enough to isolate the title validation branch for this regression test.',
    }, {})).rejects.toThrow('title must be at least 10 characters');

    await expect(adapter.post(ctx as any, {
      title: 'A valid listing title',
      body: 'Too short',
    }, {})).rejects.toThrow('description must be at least 50 characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts the bearer token from API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      'validation failed for bearer test-token',
      { status: 400 },
    ));
    const ctx = {
      ...fakeConnectContext({ UGIG_TOKEN: 'test-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'A valid listing title',
      body: 'This description is intentionally longer than fifty characters so the request reaches the mocked API.',
    }, {})).rejects.toThrow('validation failed for bearer [redacted]');
  });
});
