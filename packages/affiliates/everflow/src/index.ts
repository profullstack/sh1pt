import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-everflow",
  label: "Everflow",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("EVERFLOW_API_KEY");
    if (!token) throw new Error("EVERFLOW_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-everflow" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-everflow"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://account.everflow.io",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-everflow"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-everflow"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "EVERFLOW_API_KEY",
    label: "Everflow",
    vendorDocUrl: "https://account.everflow.io",
    steps: [
      "Log into account.everflow.io → Control Center → API",
      "Generate a Network API key (network admins) or Affiliate API key",
      "Paste below",
    ],
  }),
});
