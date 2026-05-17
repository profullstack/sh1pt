import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestVcs } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestVcs(adapter, {
  sampleConfig: { projectId: 'acme/my-app' },
  requiredSecrets: ['GITLAB_TOKEN'],
});

describe('vcs-gitlab REST API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a merge request with GitLab field names', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 1234,
      iid: 7,
      web_url: 'https://gitlab.com/acme/my-app/-/merge_requests/7',
      state: 'opened',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const pr = await adapter.createPullRequest(ctx(), {
      title: 'Ship fix',
      body: 'Details',
      head: 'feature/gitlab',
      base: 'main',
      draft: true,
      labels: ['automation', 'vcs'],
      reviewers: ['42', 'not-a-user-id'],
    }, { projectId: 'acme/my-app' });

    expect(fetchMock).toHaveBeenCalledWith('https://gitlab.com/api/v4/projects/acme%2Fmy-app/merge_requests', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'PRIVATE-TOKEN': 'gitlab-token' }),
    }));

    const body = requestBody(fetchMock);
    expect(body).toMatchObject({
      source_branch: 'feature/gitlab',
      target_branch: 'main',
      title: 'Ship fix',
      description: 'Details',
      draft: true,
      labels: 'automation,vcs',
      reviewer_ids: [42],
    });
    expect(pr).toEqual({
      id: '1234',
      number: 7,
      state: 'open',
      url: 'https://gitlab.com/acme/my-app/-/merge_requests/7',
    });
  });

  it('creates issues and maps GitLab opened state to open', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 9,
      iid: 3,
      web_url: 'https://gitlab.example.com/group/project/-/issues/3',
      state: 'opened',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const issue = await adapter.createIssue(ctx(), {
      title: 'Investigate release failure',
      body: 'The publish job failed.',
      labels: ['release'],
      assignees: ['101'],
    }, { host: 'https://gitlab.example.com/', projectId: 'group/project' });

    expect(fetchMock).toHaveBeenCalledWith('https://gitlab.example.com/api/v4/projects/group%2Fproject/issues', expect.any(Object));
    expect(requestBody(fetchMock)).toMatchObject({
      title: 'Investigate release failure',
      description: 'The publish job failed.',
      labels: 'release',
      assignee_ids: [101],
    });
    expect(issue.state).toBe('open');
  });

  it('creates webhooks with GitLab event flags', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 55 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const hook = await adapter.createWebhook(ctx(), {
      url: 'https://example.com/gitlab-hook',
      events: ['push', 'merge_request', 'issues', 'release'],
      secret: 'hook-secret',
    }, { projectId: 123 });

    expect(fetchMock).toHaveBeenCalledWith('https://gitlab.com/api/v4/projects/123/hooks', expect.any(Object));
    expect(requestBody(fetchMock)).toMatchObject({
      url: 'https://example.com/gitlab-hook',
      token: 'hook-secret',
      push_events: true,
      merge_requests_events: true,
      issues_events: true,
      releases_events: true,
      pipeline_events: false,
    });
    expect(hook).toEqual({ id: '55' });
  });

  it('includes GitLab error messages when requests fail', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { title: ['has already been taken'] },
    }), { status: 400, statusText: 'Bad Request' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.createIssue(ctx(), { title: 'Duplicate' }, { projectId: 'acme/my-app' }))
      .rejects.toThrow('GitLab POST project=acme/my-app/issues failed: 400 {"title":["has already been taken"]}');
  });
});

function ctx() {
  return {
    secret: (key: string) => key === 'GITLAB_TOKEN' ? 'gitlab-token' : undefined,
    log: vi.fn(),
  };
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body));
}
