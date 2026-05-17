import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-clickbank",
  label: "ClickBank",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("CLICKBANK_DEV_KEY");
    if (!token) throw new Error("CLICKBANK_DEV_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-clickbank" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-clickbank"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://accounts.clickbank.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-clickbank"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-clickbank"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "CLICKBANK_DEV_KEY",
    label: "ClickBank",
    vendorDocUrl: "https://accounts.clickbank.com",
    steps: [
      "Log into accounts.clickbank.com → Account Settings → API",
      "Generate a Developer API key + Clerk key",
      "Paste the Developer API key below",
    ],
  }),
});
