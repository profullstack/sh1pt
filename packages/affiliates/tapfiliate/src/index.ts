import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-tapfiliate",
  label: "Tapfiliate",
  side: "merchant",

  async connect(ctx, config) {
    const token = ctx.secret("TAPFILIATE_API_KEY");
    if (!token) throw new Error("TAPFILIATE_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-tapfiliate" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-tapfiliate"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://tapfiliate.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-tapfiliate"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-tapfiliate"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "TAPFILIATE_API_KEY",
    label: "Tapfiliate",
    vendorDocUrl: "https://tapfiliate.com",
    steps: [
      "Log into tapfiliate.com → API tab",
      "Generate a new API key",
      "Paste below",
    ],
  }),
});
