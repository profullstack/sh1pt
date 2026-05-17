import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-cj",
  label: "CJ Affiliate (Commission Junction)",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("CJ_DEVELOPER_KEY");
    if (!token) throw new Error("CJ_DEVELOPER_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-cj" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-cj"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://developers.cj.com/account/personal-access-tokens",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-cj"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-cj"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "CJ_DEVELOPER_KEY",
    label: "CJ Affiliate (Commission Junction)",
    vendorDocUrl: "https://developers.cj.com/account/personal-access-tokens",
    steps: [
      "Sign in to cj.com → Account → Developer Resources",
      "Generate a Personal Access Token (formerly Developer Key)",
      "Paste below; sh1pt encrypts it in the vault",
    ],
  }),
});
