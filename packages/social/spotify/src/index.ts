import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Spotify Web API. OAuth 2.0 with PKCE. Posting maps to playlist creation
// + edit (description / cover) — Spotify has no public feed API for artists,
// but you can manage curated playlists and (for verified artists) push
// metadata via Spotify for Artists.
interface Config {
  playlistId?: string;
}

export default defineSocial<Config>({
  id: 'social-spotify',
  label: 'Spotify',
  requires: { maxBodyChars: 300, maxHashtags: 0, hashtagsInBody: true },

  async connect(ctx) {
    if (!ctx.secret('SPOTIFY_ACCESS_TOKEN')) throw new Error('SPOTIFY_ACCESS_TOKEN not in vault');
    return { accountId: 'spotify-user' };
  },

  async post(ctx, post, config) {
    ctx.log(`spotify update · playlist=${config.playlistId ?? '(create)'} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://open.spotify.com/', platform: 'spotify', publishedAt: new Date().toISOString() };
    // TODO: PUT /v1/playlists/{id} for description; POST /v1/users/{id}/playlists to create.
    return { id: `sp_${Date.now()}`, url: 'https://open.spotify.com/', platform: 'spotify', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'SPOTIFY_ACCESS_TOKEN',
    label: 'Spotify',
    vendorDocUrl: 'https://developer.spotify.com/documentation/web-api/concepts/authorization',
    steps: [
      'Open developer.spotify.com → Dashboard → Create app',
      'Add redirect URI http://127.0.0.1:8765/callback and select scopes: playlist-modify-public, playlist-modify-private, ugc-image-upload',
      'Run the Authorization Code (PKCE) flow and copy the access token',
    ],
    ...(process.env.SH1PT_SPOTIFY_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_SPOTIFY_CLIENT_ID,
            authUrl: 'https://accounts.spotify.com/authorize',
            tokenUrl: 'https://accounts.spotify.com/api/token',
            scopes: ['playlist-modify-public', 'playlist-modify-private', 'ugc-image-upload'],
          },
        }
      : {}),
  }),
});
