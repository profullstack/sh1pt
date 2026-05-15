import { defineW3cNamespace } from '@profullstack/sh1pt-core';

export default defineW3cNamespace({
  id: 'w3c-activitypub',
  label: 'ActivityPub',
  specUrl: 'https://www.w3.org/TR/activitypub/',
  namespace: 'https://www.w3.org/ns/activitystreams',
  capabilities: ['discover', 'publish', 'receive', 'verify'],
  endpoints: [
    { id: 'actor', label: 'Actor object', method: 'GET', pathHint: '/users/{actor}' },
    { id: 'inbox', label: 'Inbox', method: 'POST', pathHint: '/users/{actor}/inbox' },
    { id: 'outbox', label: 'Outbox', method: 'GET', pathHint: '/users/{actor}/outbox' },
    { id: 'followers', label: 'Followers collection', method: 'GET', pathHint: '/users/{actor}/followers' },
    { id: 'following', label: 'Following collection', method: 'GET', pathHint: '/users/{actor}/following' },
  ],
});

