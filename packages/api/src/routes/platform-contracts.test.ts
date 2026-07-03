import { describe, expect, it } from 'vitest';
import app from '../index.js';

const jsonRequest = (path: string, body: unknown, method = 'POST') =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('platform target contracts', () => {
  it('creates a target with project context and supplied config', async () => {
    const response = await jsonRequest('/v1/projects/proj_1/targets', {
      use: 'github-releases',
      config: { repo: 'profullstack/sh1pt' },
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: 'github-releases',
      projectId: 'proj_1',
      enabled: true,
      config: { repo: 'profullstack/sh1pt' },
    });
  });

  it('rejects target creation without an adapter id', async () => {
    const response = await jsonRequest('/v1/projects/proj_1/targets', {
      config: { repo: 'profullstack/sh1pt' },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_target' });
  });

  it('rejects empty target updates', async () => {
    const response = await jsonRequest('/v1/projects/proj_1/targets/github-releases', {}, 'PATCH');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_target_update' });
  });
});

describe('release contracts', () => {
  it('creates a release using version, channel, targets, and project context', async () => {
    const response = await jsonRequest('/v1/projects/proj_1/releases', {
      version: '1.2.3',
      channel: 'beta',
      targets: ['github-releases', 'npm'],
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: 'rel_1_2_3',
      projectId: 'proj_1',
      version: '1.2.3',
      channel: 'beta',
      targets: ['github-releases', 'npm'],
      status: 'pending',
    });
  });

  it('rejects promotions to unsupported channels', async () => {
    const response = await jsonRequest('/v1/projects/proj_1/releases/rel_1/promote', {
      channel: 'production',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_promotion' });
  });
});

describe('webhook contracts', () => {
  it('creates a validated webhook subscription', async () => {
    const response = await jsonRequest('/v1/webhooks/subscriptions', {
      source: 'github',
      event: 'release.published',
      url: 'https://example.com/hooks/github',
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: 'sub_github_release_published',
      source: 'github',
      event: 'release.published',
      url: 'https://example.com/hooks/github',
    });
  });

  it('rejects subscriptions with invalid callback URLs', async () => {
    const response = await jsonRequest('/v1/webhooks/subscriptions', {
      source: 'github',
      event: 'release.published',
      url: 'not-a-url',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_subscription' });
  });
});
