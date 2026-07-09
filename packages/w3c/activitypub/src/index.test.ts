import { describe, expect, it, vi } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import namespace, {
  ACTIVITYPUB_CONTENT_TYPE,
  ACTIVITYPUB_PUBLIC,
  buildActivityPubGetRequest,
  buildActivityPubInboxPostRequest,
  buildActivityPubOutboxPostRequest,
  buildCreateNoteActivity,
  discoverActivityPubActor,
  extractActivityPubRecipients,
  normalizeActivityPubActor,
  selectActivityPubDeliveryInboxes,
  withActivityStreamsContext,
} from './index.js';

smokeTest(namespace, { idPrefix: 'w3c' });

describe('w3c-activitypub namespace', () => {
  it('declares ActivityPub endpoints needed for actor federation', () => {
    expect(namespace.specUrl).toBe('https://www.w3.org/TR/activitypub/');
    expect(namespace.namespace).toBe('https://www.w3.org/ns/activitystreams');
    expect(namespace.capabilities).toEqual(expect.arrayContaining(['publish', 'receive', 'verify']));
    expect(namespace.endpoints.map((endpoint) => endpoint.id)).toEqual(
      expect.arrayContaining(['actor', 'inbox', 'outbox', 'followers', 'following']),
    );
  });

  it('discovers actor endpoints from an ActivityStreams actor document', async () => {
    const actor = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'https://social.example/users/alice',
      type: 'Person',
      inbox: 'https://social.example/users/alice/inbox',
      outbox: 'https://social.example/users/alice/outbox',
      followers: 'https://social.example/users/alice/followers',
      following: 'https://social.example/users/alice/following',
      liked: 'https://social.example/users/alice/liked',
      endpoints: {
        sharedInbox: 'https://social.example/inbox',
      },
      publicKey: {
        id: 'https://social.example/users/alice#main-key',
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(actor), {
      headers: { 'content-type': ACTIVITYPUB_CONTENT_TYPE },
    }));

    await expect(discoverActivityPubActor('https://social.example/users/alice', {
      fetch: fetchMock,
      accessToken: 'test-token',
    })).resolves.toEqual({
      id: 'https://social.example/users/alice',
      type: 'Person',
      inbox: 'https://social.example/users/alice/inbox',
      outbox: 'https://social.example/users/alice/outbox',
      followers: 'https://social.example/users/alice/followers',
      following: 'https://social.example/users/alice/following',
      liked: 'https://social.example/users/alice/liked',
      sharedInbox: 'https://social.example/inbox',
      publicKeyId: 'https://social.example/users/alice#main-key',
      raw: actor,
    });
    expect(fetchMock).toHaveBeenCalledWith('https://social.example/users/alice', {
      method: 'GET',
      headers: {
        accept: ACTIVITYPUB_CONTENT_TYPE,
        authorization: 'Bearer test-token',
      },
    });
  });

  it('normalizes actor documents and rejects missing actor ids', () => {
    expect(normalizeActivityPubActor({
      id: 'https://social.example/users/bob',
      inbox: 'not a url',
      outbox: 'https://social.example/users/bob/outbox',
      endpoints: { sharedInbox: 'https://social.example/inbox' },
    })).toEqual({
      id: 'https://social.example/users/bob',
      outbox: 'https://social.example/users/bob/outbox',
      sharedInbox: 'https://social.example/inbox',
      raw: {
        id: 'https://social.example/users/bob',
        inbox: 'not a url',
        outbox: 'https://social.example/users/bob/outbox',
        endpoints: { sharedInbox: 'https://social.example/inbox' },
      },
    });

    expect(() => normalizeActivityPubActor({ inbox: 'https://social.example/inbox' })).toThrow(
      'missing a valid id',
    );
  });

  it('builds spec-shaped GET and POST requests', () => {
    expect(buildActivityPubGetRequest({ url: 'https://social.example/users/alice' })).toEqual({
      url: 'https://social.example/users/alice',
      method: 'GET',
      headers: {
        accept: ACTIVITYPUB_CONTENT_TYPE,
      },
    });

    const post = buildActivityPubOutboxPostRequest({
      endpointUrl: 'https://social.example/users/alice/outbox',
      accessToken: 'test-token',
      activity: {
        type: 'Like',
        actor: 'https://social.example/users/alice',
        object: 'https://remote.example/notes/1',
      },
    });

    expect(post).toMatchObject({
      url: 'https://social.example/users/alice/outbox',
      method: 'POST',
      headers: {
        accept: ACTIVITYPUB_CONTENT_TYPE,
        authorization: 'Bearer test-token',
        'content-type': ACTIVITYPUB_CONTENT_TYPE,
      },
    });
    expect(JSON.parse(post.body ?? '')).toEqual({
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Like',
      actor: 'https://social.example/users/alice',
      object: 'https://remote.example/notes/1',
    });

    const inbox = buildActivityPubInboxPostRequest({
      endpointUrl: 'https://remote.example/users/bob/inbox',
      activity: {
        '@context': ['https://www.w3.org/ns/activitystreams', { schema: 'http://schema.org#' }],
        type: 'Announce',
      },
    });
    expect(JSON.parse(inbox.body ?? '')['@context']).toEqual([
      'https://www.w3.org/ns/activitystreams',
      { schema: 'http://schema.org#' },
    ]);
  });

  it('builds Create Note activities with mirrored audience fields', () => {
    expect(buildCreateNoteActivity({
      actor: 'https://social.example/users/alice',
      id: 'https://social.example/activities/create-1',
      noteId: 'https://social.example/notes/1',
      content: 'Hello fediverse',
      to: ACTIVITYPUB_PUBLIC,
      cc: ['https://social.example/users/alice/followers'],
      published: '2026-05-21T11:10:00.000Z',
      tag: [{ type: 'Hashtag', name: '#w3c' }],
    })).toEqual({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'https://social.example/activities/create-1',
      type: 'Create',
      actor: 'https://social.example/users/alice',
      to: [ACTIVITYPUB_PUBLIC],
      cc: ['https://social.example/users/alice/followers'],
      published: '2026-05-21T11:10:00.000Z',
      object: {
        id: 'https://social.example/notes/1',
        type: 'Note',
        attributedTo: 'https://social.example/users/alice',
        content: 'Hello fediverse',
        to: [ACTIVITYPUB_PUBLIC],
        cc: ['https://social.example/users/alice/followers'],
        published: '2026-05-21T11:10:00.000Z',
        tag: [{ type: 'Hashtag', name: '#w3c' }],
      },
    });
  });

  it('extracts recipients and selects de-duplicated inboxes', () => {
    const activity = {
      type: 'Create',
      actor: 'https://social.example/users/alice',
      to: [ACTIVITYPUB_PUBLIC, 'https://remote.example/users/bob'],
      cc: [{ id: 'https://remote.example/users/carla' }],
      audience: ['https://remote.example/users/bob'],
    };

    expect(extractActivityPubRecipients(activity)).toEqual([
      'https://remote.example/users/bob',
      'https://remote.example/users/carla',
    ]);

    expect(selectActivityPubDeliveryInboxes({
      activity,
      preferSharedInbox: true,
      actors: [
        {
          id: 'https://social.example/users/alice',
          inbox: 'https://social.example/users/alice/inbox',
          raw: {},
        },
        {
          id: 'https://remote.example/users/bob',
          inbox: 'https://remote.example/users/bob/inbox',
          sharedInbox: 'https://remote.example/inbox',
          raw: {},
        },
        {
          id: 'https://remote.example/users/carla',
          inbox: 'https://remote.example/users/carla/inbox',
          sharedInbox: 'https://remote.example/inbox',
          raw: {},
        },
      ],
    })).toEqual(['https://remote.example/inbox']);
  });

  it('does not replace an existing ActivityStreams context', () => {
    const existing = {
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://example.test/context'],
      type: 'Follow',
    };

    expect(withActivityStreamsContext(existing)).toBe(existing);
    expect(withActivityStreamsContext({ type: 'Follow' })).toEqual({
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Follow',
    });
  });
});
