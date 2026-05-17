import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-sovrn",
  label: "Sovrn Commerce (VigLink)",
  side: "publisher",

  async connect(ctx, config) {
    const token = ctx.secret("SOVRN_AUTH_KEY");
    if (!token) throw new Error("SOVRN_AUTH_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-sovrn" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-sovrn"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://meridian.sovrn.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-sovrn"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-sovrn"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "SOVRN_AUTH_KEY",
    label: "Sovrn Commerce (VigLink)",
    vendorDocUrl: "https://meridian.sovrn.com",
    steps: [
      "Log into meridian.sovrn.com → Account → API",
      "Generate an Auth Key",
      "Paste below",
    ],
  }),
});
