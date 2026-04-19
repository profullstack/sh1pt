import { defineAdPlatform } from '@sh1pt/core';

// LinkedIn Ads. B2B only realistically — highest CPC of any major
// platform. Useful for SaaS, developer tools, enterprise offerings.
interface Config {
  adAccountId: string;                   // urn:li:sponsoredAccount:ID
  companyPageId?: string;                // urn:li:organization:ID
  jobTitles?: string[];                  // targeting
  companySizes?: string[];
  industries?: string[];
}

export default defineAdPlatform<Config>({
  id: 'promo-linkedin',
  label: 'LinkedIn Ads',
  async connect(ctx, config) {
    ctx.log(`connect linkedin · account=${config.adAccountId}`);
    // TODO: LinkedIn Marketing OAuth 2.0; scope r_ads_rw
    return { accountId: config.adAccountId };
  },
  async start(ctx, config) {
    ctx.log(`linkedin campaign · objective=${ctx.objective}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /adCampaignGroups + /adCampaigns + /adCreatives
    return { id: `li_${Date.now()}`, url: `https://www.linkedin.com/campaignmanager/accounts/${config.adAccountId.split(':').pop()}` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },
  async stop(id) {
    console.log(`[stub] linkedin stop ${id}`);
  },
});
