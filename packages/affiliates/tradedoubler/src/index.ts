import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-tradedoubler",
  label: "Tradedoubler",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("TRADEDOUBLER_API_TOKEN");
    if (!token) throw new Error("TRADEDOUBLER_API_TOKEN not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-tradedoubler" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-tradedoubler"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://www.tradedoubler.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-tradedoubler"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-tradedoubler"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "TRADEDOUBLER_API_TOKEN",
    label: "Tradedoubler",
    vendorDocUrl: "https://www.tradedoubler.com",
    steps: [
      "Log into tradedoubler.com → My Account → API",
      "Generate a token",
      "Paste below",
    ],
  }),
});
