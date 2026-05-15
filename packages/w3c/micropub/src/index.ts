import { defineW3cNamespace } from '@profullstack/sh1pt-core';

export default defineW3cNamespace({
  id: 'w3c-micropub',
  label: 'Micropub',
  specUrl: 'https://www.w3.org/TR/micropub/',
  namespace: 'micropub',
  capabilities: ['discover', 'publish'],
  endpoints: [
    { id: 'endpoint-discovery', label: 'Micropub endpoint discovery', method: 'GET', rel: 'micropub' },
    { id: 'create', label: 'Create post', method: 'POST' },
    { id: 'update', label: 'Update post', method: 'POST' },
    { id: 'delete', label: 'Delete post', method: 'POST' },
    { id: 'media', label: 'Media endpoint', method: 'POST', rel: 'micropub_media' },
  ],
});

