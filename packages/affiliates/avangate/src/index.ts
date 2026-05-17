import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-avangate",
  label: "Avangate (2Checkout / Verifone)",
  side: "merchant",

  async connect(ctx, config) {
    const token = ctx.secret("AVANGATE_API_KEY");
    if (!token) throw new Error("AVANGATE_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-avangate" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-avangate"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://secure.avangate.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-avangate"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-avangate"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "AVANGATE_API_KEY",
    label: "Avangate (2Checkout / Verifone)",
    vendorDocUrl: "https://secure.avangate.com",
    steps: [
      "Log into secure.avangate.com → Account → System Settings → API",
      "Generate an API key + secret",
      "Paste the API key below",
    ],
  }),
});
