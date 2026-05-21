import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Spotify Web API. Spotify has no generic feed-post endpoint; sh1pt maps a
// social post to public/private playlist creation or playlist metadata updates.
interface Config {
  playlistId?: string;
  trackUris?: string[];
  replaceItems?: boolean;
  position?: number;
  public?: boolean;
  collaborative?: boolean;
  baseUrl?: string;
}

interface SpotifyUserResponse {
  id?: string;
  error?: SpotifyError;
}

interface SpotifyPlaylistResponse {
  id?: string;
  external_urls?: {
    spotify?: string;
  };
  snapshot_id?: string;
  error?: SpotifyError;
}

interface SpotifyError {
  message?: string;
  status?: number;
}

export default defineSocial<Config>({
  id: 'social-spotify',
  label: 'Spotify',
  requires: { maxBodyChars: 300, maxHashtags: 0, hashtagsInBody: true },

  async connect(ctx) {
    const token = ctx.secret('SPOTIFY_ACCESS_TOKEN');
    if (!token) throw new Error('SPOTIFY_ACCESS_TOKEN not in vault');
    const data = await spotifyFetch<SpotifyUserResponse>(token, '/me');
    if (!data.id) throw new Error('Spotify profile response did not include a user id');
    return { accountId: data.id };
  },

  async post(ctx, post, config) {
    const token = ctx.secret('SPOTIFY_ACCESS_TOKEN');
    if (!token) throw new Error('SPOTIFY_ACCESS_TOKEN not in vault');
    ctx.log(`spotify playlist · ${config.playlistId ? 'update' : 'create'} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://open.spotify.com/', platform: 'spotify', publishedAt: new Date().toISOString() };

    const trackUris = normalizeTrackUris(config.trackUris ?? []);
    const playlist = config.playlistId
      ? await updatePlaylist(token, post, config)
      : await createPlaylist(token, post, config);

    if (trackUris.length) {
      await writePlaylistItems(token, playlist.id, trackUris, config);
    }

    return {
      id: playlist.id,
      url: playlist.url,
      platform: 'spotify',
      publishedAt: (post.schedule ?? new Date()).toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: 'SPOTIFY_ACCESS_TOKEN',
    label: 'Spotify',
    vendorDocUrl: 'https://developer.spotify.com/documentation/web-api/concepts/authorization',
    steps: [
      'Open developer.spotify.com -> Dashboard -> Create app',
      'Add redirect URI http://127.0.0.1:8765/callback and select scopes: playlist-modify-public, playlist-modify-private, ugc-image-upload',
      'Run the Authorization Code (PKCE) flow and copy the access token',
    ],
    ...(process.env.SH1PT_SPOTIFY_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_SPOTIFY_CLIENT_ID,
            authUrl: 'https://accounts.spotify.com/authorize',
            tokenUrl: 'https://accounts.spotify.com/api/token',
            scopes: ['playlist-modify-public', 'playlist-modify-private', 'ugc-image-upload', 'user-read-private'],
          },
        }
      : {}),
  }),
});

interface PlaylistResult {
  id: string;
  url: string;
}

async function createPlaylist(token: string, post: SocialPost, config: Config): Promise<PlaylistResult> {
  const data = await spotifyFetch<SpotifyPlaylistResponse>(token, '/me/playlists', config, {
    method: 'POST',
    body: JSON.stringify(playlistBody(post, config, true)),
  });
  if (!data.id) throw new Error('Spotify create playlist response did not include a playlist id');
  return {
    id: data.id,
    url: data.external_urls?.spotify ?? playlistUrl(data.id),
  };
}

async function updatePlaylist(token: string, post: SocialPost, config: Config): Promise<PlaylistResult> {
  const playlistId = requirePlaylistId(config);
  await spotifyFetch<SpotifyPlaylistResponse>(token, `/playlists/${encodeURIComponent(playlistId)}`, config, {
    method: 'PUT',
    body: JSON.stringify(playlistBody(post, config, false)),
    allowEmpty: true,
  });
  return {
    id: playlistId,
    url: playlistUrl(playlistId),
  };
}

async function writePlaylistItems(token: string, playlistId: string, trackUris: string[], config: Config): Promise<void> {
  const payload: Record<string, unknown> = { uris: trackUris };
  if (!config.replaceItems && config.position !== undefined) payload.position = config.position;
  await spotifyFetch<SpotifyPlaylistResponse>(token, `/playlists/${encodeURIComponent(playlistId)}/items`, config, {
    method: config.replaceItems ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
    allowEmpty: true,
  });
}

function playlistBody(post: SocialPost, config: Config, includeDefaults: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: playlistName(post),
    description: playlistDescription(post),
  };
  if (includeDefaults || config.public !== undefined) body.public = config.public ?? true;
  if (config.collaborative !== undefined) body.collaborative = config.collaborative;
  return body;
}

function playlistName(post: SocialPost): string {
  const base = post.title?.trim() || post.body.split('\n')[0]?.trim() || 'sh1pt playlist';
  return base.slice(0, 100);
}

function playlistDescription(post: SocialPost): string {
  const link = post.link ? `\n${post.link}` : '';
  const hashtags = (post.hashtags ?? []).map((tag) => `#${tag}`).join(' ');
  return `${post.body}${link}${hashtags ? ` ${hashtags}` : ''}`.slice(0, 300);
}

function normalizeTrackUris(values: string[]): string[] {
  return values.map(normalizeTrackUri);
}

function normalizeTrackUri(value: string): string {
  const trimmed = value.trim();
  const uriMatch = /^spotify:(track|episode):([A-Za-z0-9]+)$/.exec(trimmed);
  if (uriMatch) return trimmed;
  const urlMatch = /^https:\/\/open\.spotify\.com\/(track|episode)\/([A-Za-z0-9]+)(?:[/?#].*)?$/.exec(trimmed);
  if (urlMatch) return `spotify:${urlMatch[1]}:${urlMatch[2]}`;
  throw new Error('Spotify playlist items must be spotify:track/episode URIs or open.spotify.com track/episode URLs');
}

function requirePlaylistId(config: Config): string {
  if (!config.playlistId) throw new Error('Spotify playlistId is required to update a playlist');
  return config.playlistId;
}

interface SpotifyFetchOptions extends RequestInit {
  allowEmpty?: boolean;
}

async function spotifyFetch<T>(
  token: string,
  path: string,
  config: Config = {},
  options: SpotifyFetchOptions = {},
): Promise<T> {
  const { allowEmpty, ...init } = options;
  const res = await fetch(`${config.baseUrl ?? 'https://api.spotify.com/v1'}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) as T & { error?: SpotifyError } : {} as T & { error?: SpotifyError };
  if (!res.ok) {
    throw new Error(redact(data.error?.message ?? res.statusText, token));
  }
  if (!text && !allowEmpty) return {} as T;
  return data;
}

function redact(message: string, token: string): string {
  return message.split(token).join('[redacted]');
}

function playlistUrl(id: string): string {
  return `https://open.spotify.com/playlist/${encodeURIComponent(id)}`;
}
