import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-awin",
  label: "Awin",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("AWIN_API_TOKEN");
    if (!token) throw new Error("AWIN_API_TOKEN not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-awin" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-awin"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://ui.awin.com/awin-api",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-awin"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-awin"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "AWIN_API_TOKEN",
    label: "Awin",
    vendorDocUrl: "https://ui.awin.com/awin-api",
    steps: [
      "Log into awin.com → My Account → API Credentials",
      "Generate an OAuth2 token",
      "Paste below",
    ],
  }),
});
