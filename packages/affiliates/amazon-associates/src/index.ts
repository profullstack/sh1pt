import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-amazon-associates",
  label: "Amazon Associates / PAAPI",
  side: "publisher",

  async connect(ctx, config) {
    const token = ctx.secret("AMAZON_PAAPI_SECRET");
    if (!token) throw new Error("AMAZON_PAAPI_SECRET not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-amazon-associates" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-amazon-associates"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://affiliate-program.amazon.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-amazon-associates"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-amazon-associates"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "AMAZON_PAAPI_SECRET",
    label: "Amazon Associates / PAAPI",
    vendorDocUrl: "https://affiliate-program.amazon.com",
    steps: [
      "Join affiliate-program.amazon.com (per region)",
      "Apply for the Product Advertising API (requires 3 sales)",
      "Generate access key + secret in IAM; paste the secret below",
    ],
  }),
});
