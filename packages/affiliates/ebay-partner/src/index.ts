import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-ebay-partner",
  label: "eBay Partner Network",
  side: "publisher",

  async connect(ctx, config) {
    const token = ctx.secret("EBAY_EPN_TOKEN");
    if (!token) throw new Error("EBAY_EPN_TOKEN not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-ebay-partner" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-ebay-partner"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://partnernetwork.ebay.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-ebay-partner"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-ebay-partner"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "EBAY_EPN_TOKEN",
    label: "eBay Partner Network",
    vendorDocUrl: "https://partnernetwork.ebay.com",
    steps: [
      "Apply at partnernetwork.ebay.com",
      "Create a Campaign in the EPN dashboard, note the campaign id",
      "Generate a Production user token in developer.ebay.com; paste below",
    ],
  }),
});
