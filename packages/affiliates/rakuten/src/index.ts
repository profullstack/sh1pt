import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-rakuten",
  label: "Rakuten Advertising",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("RAKUTEN_API_TOKEN");
    if (!token) throw new Error("RAKUTEN_API_TOKEN not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-rakuten" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-rakuten"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://developers.rakutenadvertising.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-rakuten"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-rakuten"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "RAKUTEN_API_TOKEN",
    label: "Rakuten Advertising",
    vendorDocUrl: "https://developers.rakutenadvertising.com",
    steps: [
      "Log into rakutenadvertising.com → Reports → API",
      "Generate an API token under your account",
      "Paste below",
    ],
  }),
});
