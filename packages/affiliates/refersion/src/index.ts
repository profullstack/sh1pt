import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-refersion",
  label: "Refersion",
  side: "merchant",

  async connect(ctx, config) {
    const token = ctx.secret("REFERSION_API_KEY");
    if (!token) throw new Error("REFERSION_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-refersion" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-refersion"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://app.refersion.com/account/v2/api",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-refersion"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-refersion"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "REFERSION_API_KEY",
    label: "Refersion",
    vendorDocUrl: "https://app.refersion.com/account/v2/api",
    steps: [
      "Log into app.refersion.com → Account → API",
      "Generate an API key",
      "Paste below",
    ],
  }),
});
