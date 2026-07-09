import { describe, expect, it, vi } from 'vitest';
import {
  normalizeFollowAction,
  parseSocialFollowTarget,
  runBlueskySocialFollow,
} from './social-follow.js';

describe('social follow target parsing', () => {
  it('parses Bluesky follows URLs', () => {
    expect(parseSocialFollowTarget('https://bsky.app/profile/thetnholler.bsky.social/follows')).toEqual({
      platform: 'bluesky',
      actor: 'thetnholler.bsky.social',
      source: 'follows',
    });
  });

  it('accepts bare Bluesky handles with an explicit platform', () => {
    expect(parseSocialFollowTarget('@alice.bsky.social', 'bluesky')).toEqual({
      platform: 'bluesky',
      actor: 'alice.bsky.social',
      source: 'profile',
    });
  });

  it('trims whitespace around Bluesky handles and URLs', () => {
    expect(parseSocialFollowTarget(' @alice.bsky.social ', 'bluesky')).toEqual({
      platform: 'bluesky',
      actor: 'alice.bsky.social',
      source: 'profile',
    });
    expect(parseSocialFollowTarget(' https://bsky.app/profile/source.bsky.social/followers ')).toEqual({
      platform: 'bluesky',
      actor: 'source.bsky.social',
      source: 'followers',
    });
  });

  it('rejects unsupported social URLs', () => {
    expect(() => parseSocialFollowTarget('https://example.com/alice')).toThrow('only supports bsky.app URLs');
  });

  it('rejects malformed Bluesky profile URLs with a useful error', () => {
    expect(() => parseSocialFollowTarget('https://bsky.app/profile/%E0%A4%A')).toThrow(
      'Could not parse Bluesky profile URL',
    );
  });

  it('normalizes follow actions', () => {
    expect(normalizeFollowAction(undefined)).toBe('follow');
    expect(normalizeFollowAction('follow')).toBe('follow');
    expect(normalizeFollowAction(' unfollow ')).toBe('unfollow');
    expect(normalizeFollowAction('follow', true)).toBe('unfollow');
    expect(() => normalizeFollowAction('block')).toThrow('Expected --action follow or --action unfollow');
  });
});

describe('runBlueskySocialFollow', () => {
  it('previews Bluesky follows without authenticating in dry-run mode', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({
      follows: [
        { did: 'did:plc:alice', handle: 'alice.bsky.social' },
        { did: 'did:plc:bob', handle: 'bob.bsky.social' },
      ],
    }));
    const logs: string[] = [];

    const result = await runBlueskySocialFollow('https://bsky.app/profile/source.bsky.social/follows', {
      action: 'follow',
      max: 2,
      delayMs: 0,
      dryRun: true,
      fetch: fetchMock as any,
      log: (message) => logs.push(message),
    });

    expect(result).toMatchObject({
      platform: 'bluesky',
      action: 'follow',
      scanned: 2,
      changed: 0,
      dryRun: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/xrpc/app.bsky.graph.getFollows');
    expect(logs).toContain('dry-run: would follow @alice.bsky.social (did:plc:alice)');
  });

  it('follows only accounts that are not already followed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        follows: [
          { did: 'did:plc:alice', handle: 'alice.bsky.social' },
          { did: 'did:plc:bob', handle: 'bob.bsky.social' },
        ],
      }))
      .mockResolvedValueOnce(response({
        did: 'did:plc:me',
        accessJwt: 'jwt-token',
      }))
      .mockResolvedValueOnce(response({
        records: [
          {
            uri: 'at://did:plc:me/app.bsky.graph.follow/known',
            value: { subject: 'did:plc:bob' },
          },
        ],
      }))
      .mockResolvedValueOnce(response({
        uri: 'at://did:plc:me/app.bsky.graph.follow/new',
      }));
    const logs: string[] = [];

    const result = await runBlueskySocialFollow('https://bsky.app/profile/source.bsky.social/follows', {
      action: 'follow',
      account: 'me.bsky.social',
      appPassword: 'app-password',
      max: 2,
      delayMs: 0,
      fetch: fetchMock as any,
      log: (message) => logs.push(message),
    });

    expect(result).toMatchObject({
      scanned: 2,
      changed: 1,
      skipped: 1,
      dryRun: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://bsky.social/xrpc/com.atproto.server.createSession');
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/xrpc/com.atproto.repo.listRecords');
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://bsky.social/xrpc/com.atproto.repo.createRecord');

    const followPayload = JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body));
    expect(followPayload).toMatchObject({
      repo: 'did:plc:me',
      collection: 'app.bsky.graph.follow',
      record: {
        $type: 'app.bsky.graph.follow',
        subject: 'did:plc:alice',
      },
    });
    expect(logs).toContain('followed @alice.bsky.social');
    expect(logs).toContain('skip @bob.bsky.social: already following');
  });
});

function response(data: unknown): any {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
  };
}
