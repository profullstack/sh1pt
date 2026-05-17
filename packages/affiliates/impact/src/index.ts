import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-impact",
  label: "Impact (impact.com)",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("IMPACT_AUTH_TOKEN");
    if (!token) throw new Error("IMPACT_AUTH_TOKEN not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-impact" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-impact"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://app.impact.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-impact"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-impact"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "IMPACT_AUTH_TOKEN",
    label: "Impact (impact.com)",
    vendorDocUrl: "https://app.impact.com",
    steps: [
      "Log into app.impact.com → Settings → API Authentication",
      "Note the Account SID and create an Auth Token",
      "Paste the Auth Token below",
    ],
  }),
});
