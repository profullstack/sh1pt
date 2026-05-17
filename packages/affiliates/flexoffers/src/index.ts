import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-flexoffers",
  label: "FlexOffers",
  side: "publisher",

  async connect(ctx, config) {
    const token = ctx.secret("FLEXOFFERS_API_KEY");
    if (!token) throw new Error("FLEXOFFERS_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-flexoffers" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-flexoffers"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://www.flexoffers.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-flexoffers"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-flexoffers"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "FLEXOFFERS_API_KEY",
    label: "FlexOffers",
    vendorDocUrl: "https://www.flexoffers.com",
    steps: [
      "Log into publisher.flexoffers.com → Account → API",
      "Generate an API key",
      "Paste below",
    ],
  }),
});
