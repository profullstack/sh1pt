import { defineW3cNamespace } from '@profullstack/sh1pt-core';

export const ACTIVITYSTREAMS_CONTEXT = 'https://www.w3.org/ns/activitystreams';
export const ACTIVITYPUB_CONTENT_TYPE = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
export const ACTIVITYPUB_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

export type ActivityPubJson = Record<string, unknown>;
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface PreparedActivityPubRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

export interface ActivityPubEndpointDiscovery {
  id: string;
  type?: string;
  inbox?: string;
  outbox?: string;
  followers?: string;
  following?: string;
  liked?: string;
  sharedInbox?: string;
  publicKeyId?: string;
  raw: ActivityPubJson;
}

export interface ActivityPubActorDiscoveryOptions {
  fetch?: FetchLike;
  accessToken?: string;
}

export interface ActivityPubPostRequest {
  endpointUrl: string | URL;
  activity: ActivityPubJson;
  accessToken?: string;
}

export interface ActivityPubGetRequest {
  url: string | URL;
  accessToken?: string;
}

export interface ActivityPubCreateNoteInput {
  actor: string | URL;
  content: string;
  id?: string | URL;
  noteId?: string | URL;
  to?: string | readonly string[];
  cc?: string | readonly string[];
  published?: string;
  summary?: string;
  tag?: unknown;
}

export interface ActivityPubDeliveryInput {
  activity: ActivityPubJson;
  actors: readonly ActivityPubEndpointDiscovery[];
  preferSharedInbox?: boolean;
}

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

export async function discoverActivityPubActor(
  actorUrl: string | URL,
  options: ActivityPubActorDiscoveryOptions = {},
): Promise<ActivityPubEndpointDiscovery> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('ActivityPub actor discovery requires a fetch implementation');

  const request = buildActivityPubGetRequest({ url: actorUrl, accessToken: options.accessToken });
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
  });
  if (!response.ok) throw new Error(`ActivityPub actor discovery failed with HTTP ${response.status}`);

  const document = await response.json();
  return normalizeActivityPubActor(document);
}

export function buildActivityPubGetRequest(input: ActivityPubGetRequest): PreparedActivityPubRequest {
  return {
    url: new URL(input.url).toString(),
    method: 'GET',
    headers: activityPubHeaders(input.accessToken),
  };
}

export function buildActivityPubOutboxPostRequest(input: ActivityPubPostRequest): PreparedActivityPubRequest {
  return buildActivityPubPostRequest(input);
}

export function buildActivityPubInboxPostRequest(input: ActivityPubPostRequest): PreparedActivityPubRequest {
  return buildActivityPubPostRequest(input);
}

export function buildActivityPubPostRequest(input: ActivityPubPostRequest): PreparedActivityPubRequest {
  return {
    url: new URL(input.endpointUrl).toString(),
    method: 'POST',
    headers: activityPubHeaders(input.accessToken, { 'content-type': ACTIVITYPUB_CONTENT_TYPE }),
    body: JSON.stringify(withActivityStreamsContext(input.activity)),
  };
}

export function buildCreateNoteActivity(input: ActivityPubCreateNoteInput): ActivityPubJson {
  const actor = new URL(input.actor).toString();
  const note: ActivityPubJson = {
    type: 'Note',
    attributedTo: actor,
    content: input.content,
  };
  if (input.noteId) note.id = new URL(input.noteId).toString();
  if (input.to) note.to = normalizeIdList(input.to);
  if (input.cc) note.cc = normalizeIdList(input.cc);
  if (input.published) note.published = input.published;
  if (input.summary) note.summary = input.summary;
  if (input.tag !== undefined) note.tag = input.tag;

  const activity: ActivityPubJson = {
    '@context': ACTIVITYSTREAMS_CONTEXT,
    type: 'Create',
    actor,
    object: note,
  };
  if (input.id) activity.id = new URL(input.id).toString();
  if (input.to) activity.to = normalizeIdList(input.to);
  if (input.cc) activity.cc = normalizeIdList(input.cc);
  if (input.published) activity.published = input.published;

  return activity;
}

export function normalizeActivityPubActor(document: unknown): ActivityPubEndpointDiscovery {
  if (!isRecord(document)) throw new Error('ActivityPub actor document must be a JSON object');
  const id = asUrlString(document.id);
  if (!id) throw new Error('ActivityPub actor document is missing a valid id');

  const endpoints = isRecord(document.endpoints) ? document.endpoints : {};
  const publicKey = isRecord(document.publicKey) ? document.publicKey : {};

  return {
    id,
    raw: document,
    ...(typeof document.type === 'string' ? { type: document.type } : {}),
    ...optionalUrlField('inbox', document.inbox),
    ...optionalUrlField('outbox', document.outbox),
    ...optionalUrlField('followers', document.followers),
    ...optionalUrlField('following', document.following),
    ...optionalUrlField('liked', document.liked),
    ...optionalUrlField('sharedInbox', endpoints.sharedInbox),
    ...optionalUrlField('publicKeyId', publicKey.id),
  };
}

export function selectActivityPubDeliveryInboxes(input: ActivityPubDeliveryInput): string[] {
  const actor = firstId(input.activity.actor);
  const recipients = new Set(extractActivityPubRecipients(input.activity));
  const inboxes: string[] = [];
  const seen = new Set<string>();

  for (const candidate of input.actors) {
    if (candidate.id === actor) continue;
    if (recipients.size > 0 && !recipients.has(candidate.id)) continue;

    const inbox = input.preferSharedInbox && candidate.sharedInbox ? candidate.sharedInbox : candidate.inbox;
    if (!inbox || seen.has(inbox)) continue;

    seen.add(inbox);
    inboxes.push(inbox);
  }

  return inboxes;
}

export function extractActivityPubRecipients(activity: ActivityPubJson): string[] {
  const recipients = new Set<string>();
  for (const field of ['to', 'bto', 'cc', 'bcc', 'audience'] as const) {
    for (const id of normalizeIdList(activity[field])) {
      if (id !== ACTIVITYPUB_PUBLIC) recipients.add(id);
    }
  }

  return [...recipients];
}

export function withActivityStreamsContext(activity: ActivityPubJson): ActivityPubJson {
  const context = activity['@context'];
  if (context === ACTIVITYSTREAMS_CONTEXT) return activity;
  if (Array.isArray(context) && context.includes(ACTIVITYSTREAMS_CONTEXT)) return activity;

  return {
    '@context': ACTIVITYSTREAMS_CONTEXT,
    ...activity,
  };
}

function activityPubHeaders(accessToken?: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    accept: ACTIVITYPUB_CONTENT_TYPE,
    ...extra,
  };
  if (accessToken) {
    if (!accessToken.trim()) throw new Error('ActivityPub access token must not be blank');
    headers.authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function firstId(value: unknown): string | undefined {
  return normalizeIdList(value)[0];
}

function normalizeIdList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') return [value];
  if (value instanceof URL) return [value.toString()];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeIdList(item));
  if (isRecord(value)) {
    const id = asUrlString(value.id);
    return id ? [id] : [];
  }

  return [];
}

function optionalUrlField(key: string, value: unknown): Record<string, string> {
  const url = asUrlString(value);
  return url ? { [key]: url } : {};
}

function asUrlString(value: unknown): string | undefined {
  if (value instanceof URL) return value.toString();
  if (typeof value !== 'string') return undefined;

  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is ActivityPubJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
