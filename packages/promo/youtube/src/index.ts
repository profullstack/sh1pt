import { defineAdPlatform } from '@sh1pt/core';

// YouTube Ads — runs through Google Ads API but modelled as its own
// adapter because the creative constraints (video-only, format families
// like Bumper 6s / Skippable In-Stream / Shorts) are different enough
// that users think of it as a distinct channel.
type Format = 'bumper-6s' | 'skippable-in-stream' | 'non-skippable' | 'in-feed' | 'shorts';

interface Config {
  customerId: string;                    // same Google Ads customer id
  channelId?: string;                    // linked YouTube channel for attribution
  formats: Format[];
  videoAssetIds?: string[];              // YouTube video IDs — creatives must be uploaded to YT first
}

export default defineAdPlatform<Config>({
  id: 'promo-youtube',
  label: 'YouTube Ads (via Google Ads)',
  async connect(ctx, config) {
    ctx.log(`connect youtube · customer=${config.customerId}`);
    // TODO: shares auth with promo-google; just resolve and reuse the refresh token
    return { accountId: config.customerId };
  },
  async start(ctx, config) {
    const videos = ctx.creatives.filter((c) => c.video || (config.videoAssetIds?.length ?? 0) > 0);
    if (videos.length === 0) ctx.log('no video creatives — YouTube ads require video', 'error');
    ctx.log(`youtube campaign · formats=${config.formats.join(',')}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Google Ads API VideoCampaignService; upload videos first via YouTube Data API if needed
    return { id: `yt_${Date.now()}`, url: `https://ads.google.com/aw/campaigns?ocid=${config.customerId}` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },
  async stop(id) {
    console.log(`[stub] youtube stop ${id}`);
  },
});
