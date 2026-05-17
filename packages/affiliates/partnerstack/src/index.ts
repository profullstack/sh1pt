import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-partnerstack",
  label: "PartnerStack",
  side: "merchant",

  async connect(ctx, config) {
    const token = ctx.secret("PARTNERSTACK_API_KEY");
    if (!token) throw new Error("PARTNERSTACK_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-partnerstack" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-partnerstack"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://app.partnerstack.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-partnerstack"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-partnerstack"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "PARTNERSTACK_API_KEY",
    label: "PartnerStack",
    vendorDocUrl: "https://app.partnerstack.com",
    steps: [
      "Log into app.partnerstack.com → Settings → Developer",
      "Create a Public Key + Secret Key pair",
      "Paste the Secret Key below",
    ],
  }),
});
