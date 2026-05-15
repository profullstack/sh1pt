import { defineW3cNamespace } from '@profullstack/sh1pt-core';

export default defineW3cNamespace({
  id: 'w3c-websub',
  label: 'WebSub',
  specUrl: 'https://www.w3.org/TR/websub/',
  namespace: 'websub',
  capabilities: ['discover', 'subscribe', 'notify', 'verify'],
  endpoints: [
    { id: 'topic-discovery', label: 'Topic discovery', method: 'GET', rel: 'self' },
    { id: 'hub-discovery', label: 'Hub discovery', method: 'GET', rel: 'hub' },
    { id: 'subscribe', label: 'Subscription request', method: 'POST' },
    { id: 'callback-verification', label: 'Subscriber callback verification', method: 'GET' },
    { id: 'content-distribution', label: 'Content distribution', method: 'POST' },
  ],
});

