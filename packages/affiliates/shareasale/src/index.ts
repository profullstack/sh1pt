import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-shareasale",
  label: "ShareASale",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("SHAREASALE_API_TOKEN");
    if (!token) throw new Error("SHAREASALE_API_TOKEN not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-shareasale" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-shareasale"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://account.shareasale.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-shareasale"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-shareasale"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "SHAREASALE_API_TOKEN",
    label: "ShareASale",
    vendorDocUrl: "https://account.shareasale.com",
    steps: [
      "Log into shareasale.com (merchant or affiliate)",
      "Merchant Tools / Affiliate Tools → API (API token + secret)",
      "Paste the API token below",
    ],
  }),
});
