import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-skimlinks",
  label: "Skimlinks",
  side: "publisher",

  async connect(ctx, config) {
    const token = ctx.secret("SKIMLINKS_API_KEY");
    if (!token) throw new Error("SKIMLINKS_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-skimlinks" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-skimlinks"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://hub.skimlinks.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-skimlinks"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-skimlinks"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "SKIMLINKS_API_KEY",
    label: "Skimlinks",
    vendorDocUrl: "https://hub.skimlinks.com",
    steps: [
      "Log into hub.skimlinks.com → Settings → API",
      "Note the Publisher Account ID and generate an API key",
      "Paste the API key below",
    ],
  }),
});
