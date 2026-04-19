import { defineSocial } from '@sh1pt/core';

// Instagram Graph API (Meta). Photo / carousel / reel endpoints.
// Requires a Business or Creator IG account linked to a Facebook Page
// (can't post to personal accounts via API). Media is MANDATORY.
interface Config {
  igUserId: string;            // Instagram Business Account id
  pageId: string;              // linked FB Page
  format?: 'feed' | 'reel' | 'story' | 'carousel';
}

export default defineSocial<Config>({
  id: 'social-instagram',
  label: 'Instagram',
  requires: { media: ['image', 'video'], maxBodyChars: 2200, maxHashtags: 30, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret('META_PAGE_ACCESS_TOKEN')) throw new Error('META_PAGE_ACCESS_TOKEN not in vault (long-lived Page token)');
    return { accountId: config.igUserId };
  },

  async post(ctx, post, config) {
    if (!post.media?.length) {
      throw new Error('Instagram requires at least one image or video');
    }
    const format = config.format ?? (post.media.some((m) => m.kind === 'video') ? 'reel' : 'feed');
    ctx.log(`instagram post · format=${format} · media=${post.media.length}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://instagram.com/', platform: 'instagram', publishedAt: new Date().toISOString() };
    // TODO:
    //   1. POST /{igUserId}/media with image_url/video_url + caption → container id
    //   2. Poll until status_code=FINISHED (videos only)
    //   3. POST /{igUserId}/media_publish with creation_id
    return { id: `ig_${Date.now()}`, url: `https://www.instagram.com/`, platform: 'instagram', publishedAt: new Date().toISOString() };
  },
});
