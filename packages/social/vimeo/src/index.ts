import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Vimeo API. OAuth 2.0 with personal-access-token convenience for single-
// user automation. Upload is via tus (resumable) for files > 128 MB.
interface Config {
  userId?: string;
}

export default defineSocial<Config>({
  id: 'social-vimeo',
  label: 'Vimeo',
  requires: { media: ['video'], maxBodyChars: 5000, maxHashtags: 20, hashtagsInBody: false },

  async connect(ctx) {
    if (!ctx.secret('VIMEO_ACCESS_TOKEN')) throw new Error('VIMEO_ACCESS_TOKEN not in vault');
    return { accountId: 'vimeo-user' };
  },

  async post(ctx, post) {
    if (!post.media?.some((m) => m.kind === 'video')) {
      throw new Error('Vimeo requires a video upload');
    }
    ctx.log(`vimeo upload · ${post.body.length} chars description`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://vimeo.com/', platform: 'vimeo', publishedAt: new Date().toISOString() };
    // TODO: POST /me/videos with { upload: { approach: 'tus', size } } → tus PATCH chunks → PATCH /videos/{id} for name/description/privacy.
    return { id: `vi_${Date.now()}`, url: 'https://vimeo.com/', platform: 'vimeo', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'VIMEO_ACCESS_TOKEN',
    label: 'Vimeo',
    vendorDocUrl: 'https://developer.vimeo.com/api/authentication',
    steps: [
      'Open developer.vimeo.com/apps → Create an app',
      'Add callback URL http://127.0.0.1:8765/callback and request scopes: public, private, video_files, upload, edit',
      'Or generate a personal access token if you only have one publisher',
    ],
    ...(process.env.SH1PT_VIMEO_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_VIMEO_CLIENT_ID,
            authUrl: 'https://api.vimeo.com/oauth/authorize',
            tokenUrl: 'https://api.vimeo.com/oauth/access_token',
            scopes: ['public', 'private', 'video_files', 'upload', 'edit'],
          },
        }
      : {}),
  }),
});
